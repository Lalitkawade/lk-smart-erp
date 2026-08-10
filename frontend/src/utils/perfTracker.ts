// Performance Tracker & Instrumentation Helper for LK Smart ERP Startup Diagnostics

interface QueryMetric {
  table: string;
  durationMs: number;
  rows: number;
  payloadSizeBytes: number;
  timestampMs: number;
  calledBy: string;
}

interface FunctionMetric {
  fnName: string;
  durationMs: number;
  rowsTotal: number;
  isBlocking: boolean;
  timestampMs: number;
}

class StartupPerfTracker {
  private startTime: number = performance.now();
  public callCounts: Record<string, number> = {
    'getSession()': 0,
    'fetchProfileAndTenant()': 0,
    'refreshAllData()': 0,
    'fetchProducts()': 0,
    'fetchCustomers()': 0,
    'fetchSuppliers()': 0,
    'fetchSales()': 0,
    'fetchPurchases()': 0,
    'fetchExpenses()': 0,
    'fetchDemandTracker()': 0,
    'React Mount': 0,
    'Dashboard Render': 0
  };

  public queryLogs: QueryMetric[] = [];
  public functionLogs: FunctionMetric[] = [];

  public loadingStartTime: number | null = null;
  public loadingEndTime: number | null = null;
  public reactMountTime: number | null = null;
  public dashboardRenderTime: number | null = null;

  constructor() {
    console.log(`⏱️ [PERF TRACKER] Initialized at T=0.00ms`);
  }

  public getElapsedTime(): number {
    return performance.now() - this.startTime;
  }

  public incrementCall(fnName: string) {
    if (this.callCounts[fnName] === undefined) {
      this.callCounts[fnName] = 0;
    }
    this.callCounts[fnName]++;
  }

  public async logQuery<T>(
    table: string,
    calledBy: string,
    queryPromise: Promise<{ data: T[] | T | null; error: any }>
  ): Promise<{ data: T[] | T | null; error: any }> {
    const t0 = performance.now();
    try {
      const result = await queryPromise;
      const t1 = performance.now();
      const durationMs = t1 - t0;

      let rows = 0;
      let payloadSizeBytes = 0;

      if (result.data) {
        if (Array.isArray(result.data)) {
          rows = result.data.length;
        } else {
          rows = 1;
        }
        try {
          payloadSizeBytes = new Blob([JSON.stringify(result.data)]).size;
        } catch (e) {
          payloadSizeBytes = 0;
        }
      }

      const metric: QueryMetric = {
        table,
        durationMs,
        rows,
        payloadSizeBytes,
        timestampMs: t1 - this.startTime,
        calledBy
      };
      this.queryLogs.push(metric);

      console.log(
        `🔍 [PERF QUERY] Table: ${table.padEnd(24)} | Duration: ${durationMs.toFixed(2).padStart(7)}ms | Rows: ${rows.toString().padStart(5)} | Payload: ${(payloadSizeBytes / 1024).toFixed(2).padStart(6)} KB | Called By: ${calledBy}`
      );

      return result;
    } catch (err) {
      const t1 = performance.now();
      console.error(`❌ [PERF QUERY FAILED] Table: ${table} | Duration: ${(t1 - t0).toFixed(2)}ms`, err);
      throw err;
    }
  }

  public async trackFunction<T>(
    fnName: string,
    isBlocking: boolean,
    fn: () => Promise<T>
  ): Promise<T> {
    this.incrementCall(fnName);
    const callNum = this.callCounts[fnName];
    const label = `⏱️ [PERF FN] ${fnName} (#${callNum})`;
    
    console.time(label);
    const startMs = performance.now();

    try {
      const result = await fn();
      const endMs = performance.now();
      console.timeEnd(label);

      const durationMs = endMs - startMs;
      this.functionLogs.push({
        fnName: `${fnName} (#${callNum})`,
        durationMs,
        rowsTotal: 0,
        isBlocking,
        timestampMs: endMs - this.startTime
      });

      return result;
    } catch (err) {
      console.timeEnd(label);
      throw err;
    }
  }

  public printStartupSummaryTable() {
    console.log('\n===============================================================');
    console.log('📊 LK SMART ERP STARTUP PERFORMANCE REPORT');
    console.log('===============================================================');

    if (this.loadingStartTime !== null && this.loadingEndTime !== null) {
      console.log(`⏱️ loading=true Duration: ${(this.loadingEndTime - this.loadingStartTime).toFixed(2)} ms`);
      console.log(`⏱️ loading=false Timestamp: ${this.loadingEndTime.toFixed(2)} ms from start`);
    }

    if (this.reactMountTime !== null) {
      console.log(`⏱️ React Mount Timestamp: ${this.reactMountTime.toFixed(2)} ms`);
    }

    if (this.dashboardRenderTime !== null) {
      console.log(`⏱️ Dashboard Render Timestamp: ${this.dashboardRenderTime.toFixed(2)} ms`);
    }

    console.log('\n--- CALL COUNTERS & DUPLICATE EXECUTION DETECTION ---');
    Object.entries(this.callCounts).forEach(([fn, count]) => {
      if (count > 1) {
        console.warn(`⚠️ DUPLICATE DETECTED: ${fn} called ${count} times!`);
      } else {
        console.log(`  ${fn} called: ${count} time(s)`);
      }
    });

    console.log('\n--- SUPABASE QUERIES SUMMARY ---');
    console.table(
      this.queryLogs.map(q => ({
        Table: q.table,
        'Duration (ms)': Number(q.durationMs.toFixed(2)),
        Rows: q.rows,
        'Payload (KB)': Number((q.payloadSizeBytes / 1024).toFixed(2)),
        'Called By': q.calledBy,
        'Timestamp (ms)': Number(q.timestampMs.toFixed(2))
      }))
    );

    console.log('\n--- FUNCTION TIMINGS TABLE ---');
    console.table(
      this.functionLogs.map(f => ({
        Function: f.fnName,
        'Duration (ms)': Number(f.durationMs.toFixed(2)),
        'Blocking UI?': f.isBlocking ? 'YES' : 'NO',
        'Timestamp (ms)': Number(f.timestampMs.toFixed(2))
      }))
    );
    console.log('===============================================================\n');
  }
}

export const perfTracker = (window as any).__STARTUP_PERF_TRACKER__ || ((window as any).__STARTUP_PERF_TRACKER__ = new StartupPerfTracker());
