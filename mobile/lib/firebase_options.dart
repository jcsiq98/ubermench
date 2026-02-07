// Simple Firebase configuration for local development
// This file contains placeholder values for Firebase configuration
// Replace these with your actual Firebase project values

import 'package:firebase_core/firebase_core.dart' show FirebaseOptions;
import 'package:flutter/foundation.dart'
    show defaultTargetPlatform, kIsWeb, TargetPlatform;

class DefaultFirebaseOptions {
  static FirebaseOptions get currentPlatform {
    if (kIsWeb) {
      return web;
    }
    switch (defaultTargetPlatform) {
      case TargetPlatform.android:
        return android;
      case TargetPlatform.iOS:
        return ios;
      case TargetPlatform.macOS:
        return macos;
      case TargetPlatform.windows:
        return windows;
      case TargetPlatform.linux:
        return linux;
      default:
        throw UnsupportedError(
          'DefaultFirebaseOptions are not supported for this platform.',
        );
    }
  }

  static const FirebaseOptions web = FirebaseOptions(
    apiKey: 'demo-web-api-key',
    appId: '1:123456789:web:demo',
    messagingSenderId: '123456789',
    projectId: 'demo-project',
    authDomain: 'demo-project.firebaseapp.com',
    storageBucket: 'demo-project.appspot.com',
  );

  static const FirebaseOptions android = FirebaseOptions(
    apiKey: 'demo-android-api-key',
    appId: '1:123456789:android:demo',
    messagingSenderId: '123456789',
    projectId: 'demo-project',
    storageBucket: 'demo-project.appspot.com',
  );

  static const FirebaseOptions ios = FirebaseOptions(
    apiKey: 'demo-ios-api-key',
    appId: '1:123456789:ios:demo',
    messagingSenderId: '123456789',
    projectId: 'demo-project',
    storageBucket: 'demo-project.appspot.com',
    iosBundleId: 'com.example.serviciosUberLike',
  );

  static const FirebaseOptions macos = FirebaseOptions(
    apiKey: 'demo-macos-api-key',
    appId: '1:123456789:ios:demo',
    messagingSenderId: '123456789',
    projectId: 'demo-project',
    storageBucket: 'demo-project.appspot.com',
    iosBundleId: 'com.example.serviciosUberLike',
  );

  static const FirebaseOptions windows = FirebaseOptions(
    apiKey: 'demo-windows-api-key',
    appId: '1:123456789:windows:demo',
    messagingSenderId: '123456789',
    projectId: 'demo-project',
    storageBucket: 'demo-project.appspot.com',
  );

  static const FirebaseOptions linux = FirebaseOptions(
    apiKey: 'demo-linux-api-key',
    appId: '1:123456789:linux:demo',
    messagingSenderId: '123456789',
    projectId: 'demo-project',
    storageBucket: 'demo-project.appspot.com',
  );
}