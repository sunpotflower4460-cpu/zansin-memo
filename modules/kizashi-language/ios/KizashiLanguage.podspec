Pod::Spec.new do |s|
  s.name = 'KizashiLanguage'
  s.version = '1.0.0'
  s.summary = 'On-device note embeddings for Kizashi Notes'
  s.homepage = 'https://github.com/sunpotflower4460-cpu/zansin-memo'
  s.license = { :type => 'UNLICENSED' }
  s.author = 'Kizashi Notes'
  s.source = { :path => '.' }
  s.platform = :ios, '15.1'
  s.swift_version = '5.9'
  s.static_framework = true
  s.source_files = '**/*.swift'
  s.frameworks = 'NaturalLanguage', 'Accelerate'
  s.dependency 'ExpoModulesCore'
end
