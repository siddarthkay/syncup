interface JsonRpcRequest {
  jsonrpc: string;
  method: string;
  params?: any;
  id: string | number;
}

interface JsonRpcResponse<T = any> {
  jsonrpc: string;
  result?: T;
  error?: {
    code: number;
    message: string;
    data?: any;
  };
  id: string | number;
}

export class JsonRpcClient {
  private baseUrl: string;
  private requestId = 1;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  async call<T = any>(method: string, params?: any): Promise<T> {
    const request: JsonRpcRequest = {
      jsonrpc: '2.0',
      method,
      params,
      id: this.requestId++,
    };

    try {
      const response = await fetch(`${this.baseUrl}/jsonrpc`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(request),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const jsonResponse: JsonRpcResponse<T> = await response.json();

      if (jsonResponse.error) {
        throw new Error(`JSON-RPC error: ${jsonResponse.error.message} (code: ${jsonResponse.error.code})`);
      }

      return jsonResponse.result as T;
    } catch (error) {
      throw new Error(`JSON-RPC call failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async getGreeting(name: string): Promise<string> {
    return this.call('getGreeting', { name });
  }

  async getCurrentTime(): Promise<string> {
    return this.call('getCurrentTime');
  }

  async calculate(a: number, b: number): Promise<number> {
    return this.call('calculate', { a, b });
  }

  async getSystemInfo(): Promise<string> {
    return this.call('getSystemInfo');
  }

  async checkHealth(): Promise<{ status: string; port: string }> {
    const response = await fetch(`${this.baseUrl}/health`);
    if (!response.ok) {
      throw new Error(`Health check failed: ${response.status}`);
    }
    return response.json();
  }
}