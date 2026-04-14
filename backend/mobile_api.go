package gobridge

type MobileAPI struct{}

func NewMobileAPI() *MobileAPI {
	return &MobileAPI{}
}

func (m *MobileAPI) StartServer() int {
	return StartHTTPServer()
}

func (m *MobileAPI) StopServer() {
	StopHTTPServer()
}

func (m *MobileAPI) GetServerPort() int {
	return GetHTTPServerPort()
}
