package gobridge

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net"
	"net/http"
	"runtime"
	"sync"
	"time"
)

type JSONRPCRequest struct {
	JSONRPC string `json:"jsonrpc"`
	Method  string `json:"method"`
	Params  any    `json:"params,omitempty"`
	ID      any    `json:"id"`
}

type JSONRPCResponse struct {
	JSONRPC string        `json:"jsonrpc"`
	Result  any           `json:"result,omitempty"`
	Error   *JSONRPCError `json:"error,omitempty"`
	ID      any           `json:"id"`
}

type JSONRPCError struct {
	Code    int    `json:"code"`
	Message string `json:"message"`
	Data    any    `json:"data,omitempty"`
}

type HTTPServer struct {
	server *http.Server
	port   int
	mu     sync.RWMutex
}

var (
	globalServer *HTTPServer
	serverMu     sync.Mutex
)

func NewHTTPServer() *HTTPServer {
	return &HTTPServer{}
}

func (s *HTTPServer) StartServer() (int, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if s.server != nil {
		return s.port, fmt.Errorf("server already running on port %d", s.port)
	}

	listener, err := net.Listen("tcp", ":0")
	if err != nil {
		return 0, fmt.Errorf("failed to find available port: %v", err)
	}
	s.port = listener.Addr().(*net.TCPAddr).Port
	listener.Close()

	mux := http.NewServeMux()
	mux.HandleFunc("/jsonrpc", s.handleJSONRPC)
	mux.HandleFunc("/health", s.handleHealth)

	s.server = &http.Server{
		Addr:    fmt.Sprintf(":%d", s.port),
		Handler: mux,
	}

	go func() {
		log.Printf("Starting HTTP server on port %d", s.port)
		if err := s.server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Printf("HTTP server error: %v", err)
		}
	}()

	time.Sleep(100 * time.Millisecond)

	return s.port, nil
}

func (s *HTTPServer) StopServer() error {
	s.mu.Lock()
	defer s.mu.Unlock()

	if s.server == nil {
		return nil
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	err := s.server.Shutdown(ctx)
	s.server = nil
	s.port = 0

	return err
}

func (s *HTTPServer) GetPort() int {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.port
}

func (s *HTTPServer) handleHealth(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]string{
		"status": "ok",
		"port":   fmt.Sprintf("%d", s.port),
	})
}

func (s *HTTPServer) handleJSONRPC(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type")

	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusOK)
		return
	}

	if r.Method != "POST" {
		s.writeError(w, nil, -32600, "Invalid Request")
		return
	}

	var req JSONRPCRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		s.writeError(w, nil, -32700, "Parse error")
		return
	}

	response := s.processRequest(req)
	json.NewEncoder(w).Encode(response)
}

func (s *HTTPServer) processRequest(req JSONRPCRequest) JSONRPCResponse {
	if req.JSONRPC != "2.0" {
		return JSONRPCResponse{
			JSONRPC: "2.0",
			Error:   &JSONRPCError{Code: -32600, Message: "Invalid Request"},
			ID:      req.ID,
		}
	}

	switch req.Method {
	case "getGreeting":
		params, ok := req.Params.(map[string]any)
		if !ok {
			return s.errorResponse(req.ID, -32602, "Invalid params")
		}
		name, ok := params["name"].(string)
		if !ok {
			return s.errorResponse(req.ID, -32602, "Missing or invalid 'name' parameter")
		}
		result := fmt.Sprintf("Hello %s from Go!", name)
		return JSONRPCResponse{JSONRPC: "2.0", Result: result, ID: req.ID}

	case "getCurrentTime":
		result := time.Now().Format("2006-01-02 15:04:05")
		return JSONRPCResponse{JSONRPC: "2.0", Result: result, ID: req.ID}

	case "calculate":
		params, ok := req.Params.(map[string]any)
		if !ok {
			return s.errorResponse(req.ID, -32602, "Invalid params")
		}
		a, aOk := params["a"].(float64)
		b, bOk := params["b"].(float64)
		if !aOk || !bOk {
			return s.errorResponse(req.ID, -32602, "Missing or invalid 'a' or 'b' parameters")
		}
		result := int(a) + int(b)
		return JSONRPCResponse{JSONRPC: "2.0", Result: result, ID: req.ID}

	case "getSystemInfo":
		result := fmt.Sprintf("Go version: %s", runtime.Version())
		return JSONRPCResponse{JSONRPC: "2.0", Result: result, ID: req.ID}

	default:
		return s.errorResponse(req.ID, -32601, "Method not found")
	}
}

func (s *HTTPServer) errorResponse(id any, code int, message string) JSONRPCResponse {
	return JSONRPCResponse{
		JSONRPC: "2.0",
		Error:   &JSONRPCError{Code: code, Message: message},
		ID:      id,
	}
}

func (s *HTTPServer) writeError(w http.ResponseWriter, id any, code int, message string) {
	response := s.errorResponse(id, code, message)
	w.WriteHeader(http.StatusBadRequest)
	json.NewEncoder(w).Encode(response)
}

func StartHTTPServer() int {
	serverMu.Lock()
	defer serverMu.Unlock()

	if globalServer != nil {
		return globalServer.GetPort()
	}

	globalServer = NewHTTPServer()
	port, err := globalServer.StartServer()
	if err != nil {
		log.Printf("Failed to start server: %v", err)
		return 0
	}

	return port
}

func StopHTTPServer() {
	serverMu.Lock()
	defer serverMu.Unlock()

	if globalServer != nil {
		globalServer.StopServer()
		globalServer = nil
	}
}

func GetHTTPServerPort() int {
	serverMu.Lock()
	defer serverMu.Unlock()

	if globalServer == nil {
		return 0
	}

	return globalServer.GetPort()
}
