import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:firebase_auth/firebase_auth.dart';
import '../services/auth_service.dart';

// Provider for AuthService
final authServiceProvider = Provider<AuthService>((ref) => AuthService());

// Provider for authentication state stream
final authStateProvider = StreamProvider<User?>((ref) {
  return FirebaseAuth.instance.authStateChanges();
});

// Provider for current user
final userProvider = Provider<User?>((ref) {
  final authState = ref.watch(authStateProvider);
  return authState.value;
});

// Provider for authentication status
final isAuthenticatedProvider = Provider<bool>((ref) {
  final user = ref.watch(userProvider);
  return user != null;
});