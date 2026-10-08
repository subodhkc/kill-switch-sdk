"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.killSwitchMiddleware = exports.KillSwitch = void 0;
exports.createKillSwitch = createKillSwitch;
const DEFAULT_BASE_URL = 'https://api.haiec.com/kill-switch/v1';
class KillSwitch {
    constructor(config) {
        this.state = null;
        this.metricsBuffer = [];
        this.flushInterval = null;
        this.wsConnection = null;
        this.config = {
            apiKey: config.apiKey,
            systemId: config.systemId,
            mode: config.mode || 'semi-auto',
            baseUrl: config.baseUrl || DEFAULT_BASE_URL,
            onTrigger: config.onTrigger,
            onRecover: config.onRecover,
            onError: config.onError
        };
        this.initializeMetricsFlush();
    }
    initializeMetricsFlush() {
        this.flushInterval = setInterval(() => {
            if (this.metricsBuffer.length > 0) {
                this.flushMetrics();
            }
        }, 5000);
    }
    async flushMetrics() {
        const metrics = [...this.metricsBuffer];
        this.metricsBuffer = [];
        try {
            await this.request('/metrics/batch', 'POST', { metrics });
        }
        catch (error) {
            this.metricsBuffer = [...metrics, ...this.metricsBuffer];
            this.handleError(error);
        }
    }
    async request(endpoint, method = 'GET', body) {
        const url = `${this.config.baseUrl}${endpoint}`;
        const response = await fetch(url, {
            method,
            headers: {
                'Authorization': `Bearer ${this.config.apiKey}`,
                'Content-Type': 'application/json',
                'X-System-ID': this.config.systemId
            },
            body: body ? JSON.stringify(body) : undefined
        });
        if (!response.ok) {
            const error = await response.json().catch(() => ({ message: 'Request failed' }));
            throw new Error(error.message || `HTTP ${response.status}`);
        }
        return response.json();
    }
    handleError(error) {
        if (this.config.onError) {
            this.config.onError(error);
        }
        else {
            console.error('[KillSwitch]', error.message);
        }
    }
    async reportMetrics(metrics) {
        const report = {
            ...metrics,
            timestamp: metrics.timestamp || new Date().toISOString()
        };
        this.metricsBuffer.push(report);
        if (this.metricsBuffer.length >= 10) {
            await this.flushMetrics();
        }
    }
    async reportMetricsSync(metrics) {
        const report = {
            ...metrics,
            timestamp: metrics.timestamp || new Date().toISOString()
        };
        const result = await this.request('/metrics', 'POST', { metrics: report });
        this.state = result.state;
        if (result.triggered && result.event && this.config.onTrigger) {
            this.config.onTrigger(result.event);
        }
        return result;
    }
    async trigger(options) {
        const event = await this.request('/trigger', 'POST', {
            systemId: this.config.systemId,
            layer: options.layer,
            reason: options.reason,
            escalate: options.escalate || false,
            notifyChannels: options.notifyChannels || ['slack', 'email']
        });
        if (this.config.onTrigger) {
            this.config.onTrigger(event);
        }
        return event;
    }
    async triggerLayer(layer, reason) {
        return this.trigger({ layer, reason });
    }
    async triggerAll(reason) {
        return this.trigger({ layer: 5, reason, escalate: true });
    }
    async recover(notes) {
        const event = await this.request('/recover', 'POST', {
            systemId: this.config.systemId,
            notes
        });
        if (this.config.onRecover) {
            this.config.onRecover(event);
        }
        return event;
    }
    async getState() {
        this.state = await this.request(`/systems/${this.config.systemId}/state`);
        return this.state;
    }
    async setMode(mode) {
        await this.request(`/systems/${this.config.systemId}/mode`, 'PUT', { mode });
        this.config.mode = mode;
    }
    async getRules() {
        return this.request(`/systems/${this.config.systemId}/rules`);
    }
    async createRule(rule) {
        return this.request(`/systems/${this.config.systemId}/rules`, 'POST', rule);
    }
    async updateRule(ruleId, updates) {
        return this.request(`/systems/${this.config.systemId}/rules/${ruleId}`, 'PUT', updates);
    }
    async deleteRule(ruleId) {
        await this.request(`/systems/${this.config.systemId}/rules/${ruleId}`, 'DELETE');
    }
    async getAuditLog(options) {
        const params = new URLSearchParams();
        if (options?.limit)
            params.set('limit', String(options.limit));
        if (options?.offset)
            params.set('offset', String(options.offset));
        if (options?.startDate)
            params.set('startDate', options.startDate);
        if (options?.endDate)
            params.set('endDate', options.endDate);
        const query = params.toString();
        return this.request(`/systems/${this.config.systemId}/audit${query ? `?${query}` : ''}`);
    }
    async configureAlerts(config) {
        await this.request(`/systems/${this.config.systemId}/alerts`, 'PUT', config);
    }
    async testAlert(channel) {
        return this.request(`/systems/${this.config.systemId}/alerts/test`, 'POST', { channel });
    }
    connectRealtime() {
        if (this.wsConnection) {
            return;
        }
        const wsUrl = this.config.baseUrl.replace('https://', 'wss://').replace('http://', 'ws://');
        this.wsConnection = new WebSocket(`${wsUrl}/ws?systemId=${this.config.systemId}&token=${this.config.apiKey}`);
        this.wsConnection.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                if (data.type === 'trigger' && this.config.onTrigger) {
                    this.config.onTrigger(data.event);
                }
                else if (data.type === 'recover' && this.config.onRecover) {
                    this.config.onRecover(data.event);
                }
                else if (data.type === 'state') {
                    this.state = data.state;
                }
            }
            catch (error) {
                this.handleError(error);
            }
        };
        this.wsConnection.onerror = (error) => {
            this.handleError(new Error('WebSocket error'));
        };
        this.wsConnection.onclose = () => {
            this.wsConnection = null;
            setTimeout(() => this.connectRealtime(), 5000);
        };
    }
    disconnectRealtime() {
        if (this.wsConnection) {
            this.wsConnection.close();
            this.wsConnection = null;
        }
    }
    destroy() {
        if (this.flushInterval) {
            clearInterval(this.flushInterval);
            this.flushInterval = null;
        }
        this.disconnectRealtime();
        this.flushMetrics();
    }
}
exports.KillSwitch = KillSwitch;
function createKillSwitch(config) {
    return new KillSwitch(config);
}
const killSwitchMiddleware = (config) => {
    const ks = new KillSwitch(config);
    return async (req, res, next) => {
        const state = await ks.getState();
        if (state.status === 'killed' || state.status === 'offline') {
            return res.status(503).json({
                error: 'Service temporarily unavailable',
                reason: 'AI system has been shut down for safety',
                retryAfter: 300
            });
        }
        if (state.currentThrottle < 100) {
            const random = Math.random() * 100;
            if (random > state.currentThrottle) {
                return res.status(429).json({
                    error: 'Too many requests',
                    reason: 'AI system is throttled',
                    throttlePercent: state.currentThrottle,
                    retryAfter: 60
                });
            }
        }
        req.killSwitch = ks;
        next();
    };
};
exports.killSwitchMiddleware = killSwitchMiddleware;
