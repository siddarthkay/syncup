import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Text, View, TouchableOpacity, ScrollView, Animated, Dimensions, ActivityIndicator } from 'react-native';
import { useState, useEffect, useRef, useCallback, memo, useMemo } from 'react';
import GoBridge from './src/GoServerBridgeJSI';
import { JsonRpcClient } from './src/JsonRpcClient';

const { width, height } = Dimensions.get('window');

interface ResultItem {
  id: string;
  text: string;
  type: 'success' | 'error' | 'info';
  timestamp: Date;
}

export default function App() {
  const [results, setResults] = useState<ResultItem[]>([]);
  const [serverPort, setServerPort] = useState<number>(0);
  const [jsonRpcClient, setJsonRpcClient] = useState<JsonRpcClient | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);

  const fadeAnim = useRef(new Animated.Value(0)).current;

  const startServer = () => {
    try {
      const port = GoBridge.startServer();
      setServerPort(port);
      if (port > 0) {
        const client = new JsonRpcClient(`http://localhost:${port}`);
        setJsonRpcClient(client);
        addResult(`Server started on port ${port}`, 'success');
      } else {
        addResult(`Failed to start server`, 'error');
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      addResult(`Server error: ${errorMessage}`, 'error');
    }
  };

  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 1000,
      useNativeDriver: true,
    }).start();

    startServer();
  }, []);

  const addResult = (text: string, type: 'success' | 'error' | 'info') => {
    const newResult: ResultItem = {
      id: Date.now() + Math.random().toString(),
      text,
      type,
      timestamp: new Date(),
    };
    setResults(prev => [newResult, ...prev.slice(0, 19)]);
  };

  const testServerInfo = useCallback(async () => {
    if (isLoading) return;
    setIsLoading(true);

    try {
      const port = GoBridge.getServerPort();
      addResult(`Server port: ${port}`, 'success');

      if (port > 0) {
        addResult(`JSON-RPC server is running on port ${port}`, 'info');
      } else {
        addResult(`JSON-RPC server is not running`, 'info');
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      addResult(`Error: ${errorMessage}`, 'error');
    }

    setIsLoading(false);
  }, [isLoading]);

  const testAPI = useCallback(async () => {
    if (!jsonRpcClient || isLoading) {
      addResult('Server not running', 'error');
      return;
    }

    setIsLoading(true);

    try {
      const health = await jsonRpcClient.checkHealth();
      addResult(`Health: ${health.status}`, 'success');

      const greeting = await jsonRpcClient.getGreeting('HTTP Client');
      addResult(`API Greeting: ${greeting}`, 'success');

      const time = await jsonRpcClient.getCurrentTime();
      addResult(`API Time: ${time}`, 'success');

      const sum = await jsonRpcClient.calculate(25, 17);
      addResult(`25 + 17 = ${sum}`, 'success');

      const info = await jsonRpcClient.getSystemInfo();
      addResult(`API System: ${info}`, 'success');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      addResult(`API error: ${errorMessage}`, 'error');
    }

    setIsLoading(false);
  }, [jsonRpcClient, isLoading]);

  const clearResults = useCallback(() => {
    setResults([]);
  }, []);

  const buttonStyles = useMemo(() => ({
    primary: [styles.button, styles.primaryButton],
    secondary: [styles.button, styles.secondaryButton],
    ghost: [styles.button, styles.ghostButton],
    primaryDisabled: [styles.button, styles.primaryButton, styles.buttonDisabled],
    secondaryDisabled: [styles.button, styles.secondaryButton, styles.buttonDisabled],
    ghostDisabled: [styles.button, styles.ghostButton, styles.buttonDisabled],
  }), []);

  const textStyles = useMemo(() => ({
    normal: styles.buttonText,
    disabled: [styles.buttonText, styles.buttonTextDisabled],
  }), []);

  const Button = memo(({ onPress, title, variant = 'primary', disabled = false }: any) => {
    const buttonStyle = disabled ? buttonStyles[`${variant}Disabled`] : buttonStyles[variant];
    const textStyle = disabled ? textStyles.disabled : textStyles.normal;

    return (
      <TouchableOpacity
        style={buttonStyle}
        onPress={disabled ? undefined : onPress}
        activeOpacity={disabled ? 1 : 0.7}
        pointerEvents={disabled ? 'none' : 'auto'}
      >
        <Text style={textStyle}>
          {title}
        </Text>
      </TouchableOpacity>
    );
  });

  return (
    <Animated.View style={[styles.container, { opacity: fadeAnim }]}>
      <StatusBar style="light" />

      <View style={styles.header}>
        <Text style={styles.title}>RN + Local GoLang Server</Text>
        {serverPort > 0 && (
          <View style={styles.status}>
            <View style={styles.statusDot} />
            <Text style={styles.statusText}>Server running on {serverPort}</Text>
          </View>
        )}
      </View>

      <View style={styles.controls}>
        <View style={styles.buttonRow}>
          <Button
            title="Server Info"
            onPress={testServerInfo}
            variant="primary"
            disabled={isLoading}
          />
          <Button
            title="Test RPC"
            onPress={testAPI}
            variant="secondary"
            disabled={!jsonRpcClient || isLoading}
          />
          <Button
            title="Clear"
            onPress={clearResults}
            variant="ghost"
          />
        </View>
        <View style={styles.statusRow}>
          {isLoading && (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="small" color="#0066ff" />
              <Text style={styles.loadingText}>Testing...</Text>
            </View>
          )}
        </View>
      </View>

      <View style={styles.results}>
        <ScrollView showsVerticalScrollIndicator={false}>
          {results.map((result) => (
            <View
              key={result.id}
              style={[styles.result, styles[`result${result.type.charAt(0).toUpperCase() + result.type.slice(1)}`]]}
            >
              <Text style={styles.resultText}>{result.text}</Text>
              <Text style={styles.resultTime}>
                {result.timestamp.toLocaleTimeString()}
              </Text>
            </View>
          ))}
          {results.length === 0 && (
            <Text style={styles.emptyText}>No results yet</Text>
          )}
        </ScrollView>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
    paddingTop: 60,
    paddingHorizontal: 20,
  },
  header: {
    alignItems: 'center',
    marginBottom: 30,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#fff',
    letterSpacing: 1,
  },
  status: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#1a1a1a',
    borderRadius: 20,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#00ff00',
    marginRight: 8,
  },
  statusText: {
    color: '#00ff00',
    fontSize: 12,
    fontWeight: '600',
  },
  controls: {
    marginBottom: 20,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
  },
  statusRow: {
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  loadingText: {
    color: '#0066ff',
    fontSize: 12,
    fontWeight: '600',
  },
  button: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
  },
  primaryButton: {
    backgroundColor: '#0066ff',
    borderColor: '#0066ff',
  },
  secondaryButton: {
    backgroundColor: 'transparent',
    borderColor: '#333',
  },
  ghostButton: {
    backgroundColor: 'transparent',
    borderColor: '#666',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
  buttonTextDisabled: {
    color: '#666',
  },
  results: {
    flex: 1,
    backgroundColor: '#0a0a0a',
    borderRadius: 16,
    padding: 16,
  },
  result: {
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
    borderLeftWidth: 3,
  },
  resultSuccess: {
    backgroundColor: '#001100',
    borderLeftColor: '#00ff00',
  },
  resultError: {
    backgroundColor: '#110000',
    borderLeftColor: '#ff0000',
  },
  resultInfo: {
    backgroundColor: '#001111',
    borderLeftColor: '#00ffff',
  },
  resultText: {
    color: '#fff',
    fontSize: 13,
    lineHeight: 18,
  },
  resultTime: {
    color: '#666',
    fontSize: 10,
    marginTop: 4,
    textAlign: 'right',
  },
  emptyText: {
    color: '#666',
    textAlign: 'center',
    marginTop: 40,
    fontSize: 14,
  },
});
