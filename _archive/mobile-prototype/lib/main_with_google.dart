import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:firebase_core/firebase_core.dart';
import 'firebase_options.dart';
import 'providers/auth_provider.dart';
import 'pages/login_with_google.dart';
import 'pages/home_page.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  
  // Initialize Firebase
  await Firebase.initializeApp(
    options: DefaultFirebaseOptions.currentPlatform,
  );
  
  runApp(
    const ProviderScope(
      child: ServiciosAppWithGoogle(),
    ),
  );
}

class ServiciosAppWithGoogle extends ConsumerWidget {
  const ServiciosAppWithGoogle({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final user = ref.watch(userProvider);

    return MaterialApp(
      title: 'Servicios Uber Like with Google Auth',
      theme: ThemeData(
        primarySwatch: Colors.blue,
        visualDensity: VisualDensity.adaptivePlatformDensity,
      ),
      home: user == null ? const LoginWithGooglePage() : const HomePage(),
      debugShowCheckedModeBanner: false,
    );
  }
}
