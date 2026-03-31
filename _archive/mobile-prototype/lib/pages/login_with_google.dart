import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../providers/auth_provider.dart';

class LoginWithGooglePage extends ConsumerWidget {
  const LoginWithGooglePage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final authService = ref.watch(authServiceProvider);
    final user = ref.watch(userProvider);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Servicios Uber Like'),
        backgroundColor: Colors.blue,
        foregroundColor: Colors.white,
      ),
      body: Center(
        child: Padding(
          padding: const EdgeInsets.all(20.0),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              const Icon(
                Icons.local_taxi,
                size: 100,
                color: Colors.blue,
              ),
              const SizedBox(height: 30),
              const Text(
                'Bienvenido a Servicios Uber Like',
                style: TextStyle(
                  fontSize: 24,
                  fontWeight: FontWeight.bold,
                ),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 10),
              const Text(
                'Encuentra servicios cerca de ti',
                style: TextStyle(
                  fontSize: 16,
                  color: Colors.grey,
                ),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 50),
              if (user == null)
                ElevatedButton.icon(
                  onPressed: () async {
                    try {
                      await authService.signInWithGoogle();
                    } catch (e) {
                      ScaffoldMessenger.of(context).showSnackBar(
                        SnackBar(
                          content: Text('Error al iniciar sesión: $e'),
                          backgroundColor: Colors.red,
                        ),
                      );
                    }
                  },
                  icon: const Icon(Icons.login),
                  label: const Text('Iniciar sesión con Google'),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: Colors.blue,
                    foregroundColor: Colors.white,
                    padding: const EdgeInsets.symmetric(
                      horizontal: 30,
                      vertical: 15,
                    ),
                  ),
                )
              else
                Column(
                  children: [
                    Text('¡Hola, ${user.displayName ?? user.email}!'),
                    const SizedBox(height: 20),
                    ElevatedButton(
                      onPressed: () async {
                        await authService.signOut();
                      },
                      child: const Text('Cerrar sesión'),
                    ),
                  ],
                ),
            ],
          ),
        ),
      ),
    );
  }
}