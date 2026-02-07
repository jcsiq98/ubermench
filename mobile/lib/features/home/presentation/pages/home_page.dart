import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../data/models/service_request_model.dart';

class HomePage extends ConsumerWidget {
  const HomePage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Servicios'),
        actions: [
          IconButton(
            icon: const Icon(Icons.person),
            onPressed: () => context.go('/profile'),
          ),
        ],
      ),
      body: Padding(
        padding: const EdgeInsets.all(16.0),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'What service do you need?',
              style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                fontWeight: FontWeight.bold,
              ),
            ),
            const SizedBox(height: 24),
            Expanded(
              child: GridView.builder(
                gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                  crossAxisCount: 2,
                  crossAxisSpacing: 16,
                  mainAxisSpacing: 16,
                  childAspectRatio: 1.2,
                ),
                itemCount: ServiceType.values.length,
                itemBuilder: (context, index) {
                  final serviceType = ServiceType.values[index];
                  return _ServiceCard(
                    serviceType: serviceType,
                    onTap: () => context.go('/request', extra: serviceType),
                  );
                },
              ),
            ),
          ],
        ),
      ),
      floatingActionButton: FloatingActionButton(
        onPressed: () => context.go('/map'),
        child: const Icon(Icons.map),
      ),
    );
  }
}

class _ServiceCard extends StatelessWidget {
  final ServiceType serviceType;
  final VoidCallback onTap;

  const _ServiceCard({
    required this.serviceType,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return Card(
      elevation: 4,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(12),
        child: Padding(
          padding: const EdgeInsets.all(16.0),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(
                _getServiceIcon(serviceType),
                size: 48,
                color: Theme.of(context).primaryColor,
              ),
              const SizedBox(height: 12),
              Text(
                _getServiceName(serviceType),
                style: Theme.of(context).textTheme.titleMedium?.copyWith(
                  fontWeight: FontWeight.bold,
                ),
                textAlign: TextAlign.center,
              ),
            ],
          ),
        ),
      ),
    );
  }

  IconData _getServiceIcon(ServiceType serviceType) {
    switch (serviceType) {
      case ServiceType.plumbing:
        return Icons.plumbing;
      case ServiceType.electrical:
        return Icons.electrical_services;
      case ServiceType.cleaning:
        return Icons.cleaning_services;
      case ServiceType.gardening:
        return Icons.local_florist;
      case ServiceType.repair:
        return Icons.build;
      case ServiceType.other:
        return Icons.more_horiz;
    }
  }

  String _getServiceName(ServiceType serviceType) {
    switch (serviceType) {
      case ServiceType.plumbing:
        return 'Plumbing';
      case ServiceType.electrical:
        return 'Electrical';
      case ServiceType.cleaning:
        return 'Cleaning';
      case ServiceType.gardening:
        return 'Gardening';
      case ServiceType.repair:
        return 'Repair';
      case ServiceType.other:
        return 'Other';
    }
  }
}


