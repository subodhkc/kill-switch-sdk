import type { KillSwitchConfig, MetricReport, TriggerOptions, SystemState, KillSwitchEvent, RecoveryEvent, AutomationRule, AuditLogEntry, AlertConfig, AutomationMode } from './types';
export declare class KillSwitch {
    private config;
    private state;
    private metricsBuffer;
    private flushInterval;
    private wsConnection;
    constructor(config: KillSwitchConfig);
    private initializeMetricsFlush;
    private flushMetrics;
    private request;
    private handleError;
    reportMetrics(metrics: MetricReport): Promise<void>;
    reportMetricsSync(metrics: MetricReport): Promise<{
        triggered: boolean;
        state: SystemState;
    }>;
    trigger(options: TriggerOptions): Promise<KillSwitchEvent>;
    triggerLayer(layer: 1 | 2 | 3 | 4 | 5, reason: string): Promise<KillSwitchEvent>;
    triggerAll(reason: string): Promise<KillSwitchEvent>;
    recover(notes?: string): Promise<RecoveryEvent>;
    getState(): Promise<SystemState>;
    setMode(mode: AutomationMode): Promise<void>;
    getRules(): Promise<AutomationRule[]>;
    createRule(rule: Omit<AutomationRule, 'id'>): Promise<AutomationRule>;
    updateRule(ruleId: string, updates: Partial<AutomationRule>): Promise<AutomationRule>;
    deleteRule(ruleId: string): Promise<void>;
    getAuditLog(options?: {
        limit?: number;
        offset?: number;
        startDate?: string;
        endDate?: string;
    }): Promise<AuditLogEntry[]>;
    configureAlerts(config: AlertConfig): Promise<void>;
    testAlert(channel: 'slack' | 'pagerduty' | 'email' | 'webhook'): Promise<{
        success: boolean;
        message: string;
    }>;
    connectRealtime(): void;
    disconnectRealtime(): void;
    destroy(): void;
}
export declare function createKillSwitch(config: KillSwitchConfig): KillSwitch;
export declare const killSwitchMiddleware: (config: KillSwitchConfig) => (req: any, res: any, next: any) => Promise<any>;
