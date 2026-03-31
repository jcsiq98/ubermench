import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../data/models/service_request_model.dart';

class RequestPage extends ConsumerStatefulWidget {
  final ServiceType? serviceType;
  
  const RequestPage({super.key, this.serviceType});

  @override
  ConsumerState<RequestPage> createState() => _RequestPageState();
}

class _RequestPageState extends ConsumerState<RequestPage> {
  final _formKey = GlobalKey<FormState>();
  final _descriptionController = TextEditingController();
  ServiceType _selectedServiceType = ServiceType.plumbing;
  String _selectedAddress = '';
  double _selectedLat = 0.0;
  double _selectedLng = 0.0;
  bool _isLoading = false;

  @override
  void initState() {
    super.initState();
    if (widget.serviceType != null) {
      _selectedServiceType = widget.serviceType!;
    }
  }

  @override
  void dispose() {
    _descriptionController.dispose();
    super.dispose();
  }

  Future<void> _createRequest() async {
    if (!_formKey.currentState!.validate()) return;
    if (_selectedAddress.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Please select a location')),
      );
      return;
    }

    setState(() => _isLoading = true);

    try {
      // TODO: Implement API call to create service request
      await Future.delayed(const Duration(seconds: 2)); // Simulate API call
      
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Service request created successfully!')),
        );
        context.go('/home');
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Failed to create request: $e')),
        );
      }
    } finally {
      if (mounted) {
        setState(() => _isLoading = false);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Request Service'),
        leading: IconButton(
          icon: const Icon(Icons.arrow_back),
          onPressed: () => context.go('/home'),
        ),
      ),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(16.0),
          child: Form(
            key: _formKey,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Card(
                  child: Padding(
                    padding: const EdgeInsets.all(16.0),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'Service Type',
                          style: Theme.of(context).textTheme.titleMedium?.copyWith(
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                        const SizedBox(height: 12),
                        DropdownButtonFormField<ServiceType>(
                          value: _selectedServiceType,
                          decoration: const InputDecoration(
                            border: OutlineInputBorder(),
                            prefixIcon: Icon(Icons.category),
                          ),
                          items: ServiceType.values.map((type) {
                            return DropdownMenuItem(
                              value: type,
                              child: Text(_getServiceName(type)),
                            );
                          }).toList(),
                          onChanged: (value) {
                            if (value != null) {
                              setState(() => _selectedServiceType = value);
                            }
                          },
                        ),
                      ],
                    ),
                  ),
                ),
                const SizedBox(height: 16),
                Card(
                  child: Padding(
                    padding: const EdgeInsets.all(16.0),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'Location',
                          style: Theme.of(context).textTheme.titleMedium?.copyWith(
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                        const SizedBox(height: 12),
                        InkWell(
                          onTap: () async {
                            // TODO: Implement map selection
                            final result = await context.push('/map');
                            if (result != null && result is Map<String, dynamic>) {
                              setState(() {
                                _selectedAddress = result['address'] ?? '';
                                _selectedLat = result['lat'] ?? 0.0;
                                _selectedLng = result['lng'] ?? 0.0;
                              });
                            }
                          },
                          child: Container(
                            padding: const EdgeInsets.all(12),
                            decoration: BoxDecoration(
                              border: Border.all(color: Colors.grey),
                              borderRadius: BorderRadius.circular(8),
                            ),
                            child: Row(
                              children: [
                                const Icon(Icons.location_on),
                                const SizedBox(width: 8),
                                Expanded(
                                  child: Text(
                                    _selectedAddress.isEmpty 
                                        ? 'Select location' 
                                        : _selectedAddress,
                                    style: TextStyle(
                                      color: _selectedAddress.isEmpty 
                                          ? Colors.grey 
                                          : Colors.black,
                                    ),
                                  ),
                                ),
                                const Icon(Icons.arrow_forward_ios),
                              ],
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
                const SizedBox(height: 16),
                Card(
                  child: Padding(
                    padding: const EdgeInsets.all(16.0),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'Description',
                          style: Theme.of(context).textTheme.titleMedium?.copyWith(
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                        const SizedBox(height: 12),
                        TextFormField(
                          controller: _descriptionController,
                          maxLines: 4,
                          decoration: const InputDecoration(
                            hintText: 'Describe what you need...',
                            border: OutlineInputBorder(),
                          ),
                          validator: (value) {
                            if (value == null || value.isEmpty) {
                              return 'Please provide a description';
                            }
                            return null;
                          },
                        ),
                      ],
                    ),
                  ),
                ),
                const SizedBox(height: 24),
                ElevatedButton(
                  onPressed: _isLoading ? null : _createRequest,
                  style: ElevatedButton.styleFrom(
                    padding: const EdgeInsets.symmetric(vertical: 16),
                  ),
                  child: _isLoading
                      ? const SizedBox(
                          height: 20,
                          width: 20,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : const Text('Request Service'),
                ),
              ],
            ),
          ),
        ),
      ),
    );
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


