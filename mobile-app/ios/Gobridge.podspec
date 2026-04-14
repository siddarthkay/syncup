Pod::Spec.new do |s|
  s.name             = 'Gobridge'
  s.version          = '1.0.0'
  s.summary          = 'Go backend bridge for React Native'
  s.description      = 'Native iOS bridge that provides React Native access to Go backend functionality via XCFramework.'
  s.homepage         = 'https://github.com/siddarthkay/go-react-native-monorepo'
  s.license          = { :type => 'MIT' }
  s.author           = { 'siddarthkay' => 'siddarthkay@gmail.com' }
  s.source           = { :path => '.' }
  s.vendored_frameworks = 'Frameworks/Gobridge.xcframework'
  s.platform         = :ios, '16.0'
  s.swift_version    = '5.0'
  s.requires_arc     = true
end