import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

class AvailableTasksPage extends ConsumerStatefulWidget {
  const AvailableTasksPage({super.key});

  @override
  ConsumerState<AvailableTasksPage> createState() => _AvailableTasksPageState();
}

class _AvailableTasksPageState extends ConsumerState<AvailableTasksPage> {
  String _selectedCategory = 'Todas';
  String _sortBy = 'Más recientes';

  final List<Map<String, dynamic>> _mockTasks = [
    {
      'id': '1',
      'title': 'Reparar grifo de la cocina',
      'description': 'El grifo de la cocina tiene una fuga constante. Necesito que lo reparen o reemplacen.',
      'category': 'Plomería',
      'budget': 80.0,
      'location': 'Centro de la ciudad',
      'duration': 60,
      'postedAt': DateTime.now().subtract(const Duration(hours: 2)),
      'clientRating': 4.8,
      'clientTasks': 15,
      'images': ['https://via.placeholder.com/150'],
      'skills': ['Reparación de grifos', 'Plomería básica'],
    },
    {
      'id': '2',
      'title': 'Montar mueble de IKEA',
      'description': 'Tengo un armario de IKEA que necesito montar. Incluye todas las piezas y herramientas.',
      'category': 'Montaje de Muebles',
      'budget': 50.0,
      'location': 'Zona norte',
      'duration': 90,
      'postedAt': DateTime.now().subtract(const Duration(hours: 4)),
      'clientRating': 4.9,
      'clientTasks': 8,
      'images': ['https://via.placeholder.com/150'],
      'skills': ['Montaje de muebles', 'Herramientas'],
    },
    {
      'id': '3',
      'title': 'Limpieza profunda de casa',
      'description': 'Necesito una limpieza profunda de toda la casa, incluyendo cocina y baños.',
      'category': 'Limpieza',
      'budget': 120.0,
      'location': 'Zona sur',
      'duration': 180,
      'postedAt': DateTime.now().subtract(const Duration(hours: 6)),
      'clientRating': 4.7,
      'clientTasks': 23,
      'images': ['https://via.placeholder.com/150'],
      'skills': ['Limpieza profunda', 'Productos de limpieza'],
    },
    {
      'id': '4',
      'title': 'Instalación de enchufe',
      'description': 'Necesito instalar un enchufe adicional en la sala de estar.',
      'category': 'Electricidad',
      'budget': 60.0,
      'location': 'Zona este',
      'duration': 45,
      'postedAt': DateTime.now().subtract(const Duration(hours: 8)),
      'clientRating': 4.6,
      'clientTasks': 12,
      'images': ['https://via.placeholder.com/150'],
      'skills': ['Instalación eléctrica', 'Cableado'],
    },
  ];

  final List<String> _categories = [
    'Todas',
    'Plomería',
    'Electricidad',
    'Limpieza',
    'Jardinería',
    'Carpintería',
    'Pintura',
    'Montaje de Muebles',
    'Mudanzas',
  ];

  final List<String> _sortOptions = [
    'Más recientes',
    'Presupuesto alto',
    'Presupuesto bajo',
    'Más cercanos',
  ];

  @override
  Widget build(BuildContext context) {
    final filteredTasks = _getFilteredTasks();

    return Scaffold(
      appBar: AppBar(
        title: const Text('Tareas Disponibles'),
        backgroundColor: Colors.blue,
        foregroundColor: Colors.white,
        actions: [
          IconButton(
            icon: const Icon(Icons.filter_list),
            onPressed: _showFilterDialog,
          ),
        ],
      ),
      body: Column(
        children: [
          _buildFilterChips(),
          Expanded(
            child: filteredTasks.isEmpty
                ? _buildEmptyState()
                : ListView.builder(
                    padding: const EdgeInsets.all(16),
                    itemCount: filteredTasks.length,
                    itemBuilder: (context, index) {
                      final task = filteredTasks[index];
                      return _buildTaskCard(task);
                    },
                  ),
          ),
        ],
      ),
    );
  }

  Widget _buildFilterChips() {
    return Container(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            'Categorías',
            style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
          ),
          const SizedBox(height: 8),
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: Row(
              children: _categories.map((category) {
                final isSelected = _selectedCategory == category;
                return Padding(
                  padding: const EdgeInsets.only(right: 8),
                  child: FilterChip(
                    label: Text(category),
                    selected: isSelected,
                    onSelected: (selected) {
                      setState(() {
                        _selectedCategory = category;
                      });
                    },
                    selectedColor: Colors.blue.shade100,
                    checkmarkColor: Colors.blue,
                  ),
                );
              }).toList(),
            ),
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              const Text(
                'Ordenar por: ',
                style: TextStyle(fontSize: 14, fontWeight: FontWeight.w500),
              ),
              DropdownButton<String>(
                value: _sortBy,
                underline: Container(),
                onChanged: (value) {
                  setState(() {
                    _sortBy = value!;
                  });
                },
                items: _sortOptions.map((option) {
                  return DropdownMenuItem(
                    value: option,
                    child: Text(option),
                  );
                }).toList(),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildTaskCard(Map<String, dynamic> task) {
    return Card(
      margin: const EdgeInsets.only(bottom: 16),
      elevation: 2,
      child: InkWell(
        onTap: () => _showTaskDetails(task),
        borderRadius: BorderRadius.circular(8),
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Expanded(
                    child: Text(
                      task['title'],
                      style: const TextStyle(
                        fontSize: 18,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                  ),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                    decoration: BoxDecoration(
                      color: Colors.blue.shade100,
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: Text(
                      task['category'],
                      style: TextStyle(
                        fontSize: 12,
                        color: Colors.blue.shade700,
                        fontWeight: FontWeight.w500,
                      ),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 8),
              Text(
                task['description'],
                style: TextStyle(
                  fontSize: 14,
                  color: Colors.grey[600],
                ),
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
              ),
              const SizedBox(height: 12),
              Row(
                children: [
                  Icon(Icons.location_on, size: 16, color: Colors.grey[600]),
                  const SizedBox(width: 4),
                  Text(
                    task['location'],
                    style: TextStyle(fontSize: 14, color: Colors.grey[600]),
                  ),
                  const SizedBox(width: 16),
                  Icon(Icons.access_time, size: 16, color: Colors.grey[600]),
                  const SizedBox(width: 4),
                  Text(
                    '${task['duration']} min',
                    style: TextStyle(fontSize: 14, color: Colors.grey[600]),
                  ),
                ],
              ),
              const SizedBox(height: 12),
              Row(
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          '\$${task['budget'].toStringAsFixed(0)}',
                          style: const TextStyle(
                            fontSize: 20,
                            fontWeight: FontWeight.bold,
                            color: Colors.green,
                          ),
                        ),
                        Text(
                          'Presupuesto estimado',
                          style: TextStyle(
                            fontSize: 12,
                            color: Colors.grey[600],
                          ),
                        ),
                      ],
                    ),
                  ),
                  Column(
                    crossAxisAlignment: CrossAxisAlignment.end,
                    children: [
                      Row(
                        children: [
                          Icon(Icons.star, size: 16, color: Colors.amber[600]),
                          const SizedBox(width: 4),
                          Text(
                            task['clientRating'].toString(),
                            style: const TextStyle(fontWeight: FontWeight.bold),
                          ),
                        ],
                      ),
                      Text(
                        '${task['clientTasks']} tareas',
                        style: TextStyle(
                          fontSize: 12,
                          color: Colors.grey[600],
                        ),
                      ),
                    ],
                  ),
                ],
              ),
              const SizedBox(height: 12),
              Row(
                children: [
                  Expanded(
                    child: OutlinedButton.icon(
                      onPressed: () => _showBidDialog(task),
                      icon: const Icon(Icons.gavel, size: 16),
                      label: const Text('Hacer Oferta'),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: ElevatedButton.icon(
                      onPressed: () => _showTaskDetails(task),
                      icon: const Icon(Icons.visibility, size: 16),
                      label: const Text('Ver Detalles'),
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildEmptyState() {
    return const Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(
            Icons.search_off,
            size: 80,
            color: Colors.grey,
          ),
          SizedBox(height: 16),
          Text(
            'No hay tareas disponibles',
            style: TextStyle(
              fontSize: 18,
              fontWeight: FontWeight.bold,
              color: Colors.grey,
            ),
          ),
          SizedBox(height: 8),
          Text(
            'Intenta cambiar los filtros o vuelve más tarde',
            style: TextStyle(
              fontSize: 14,
              color: Colors.grey,
            ),
          ),
        ],
      ),
    );
  }

  List<Map<String, dynamic>> _getFilteredTasks() {
    var tasks = List<Map<String, dynamic>>.from(_mockTasks);

    // Filter by category
    if (_selectedCategory != 'Todas') {
      tasks = tasks.where((task) => task['category'] == _selectedCategory).toList();
    }

    // Sort tasks
    switch (_sortBy) {
      case 'Más recientes':
        tasks.sort((a, b) => b['postedAt'].compareTo(a['postedAt']));
        break;
      case 'Presupuesto alto':
        tasks.sort((a, b) => b['budget'].compareTo(a['budget']));
        break;
      case 'Presupuesto bajo':
        tasks.sort((a, b) => a['budget'].compareTo(b['budget']));
        break;
      case 'Más cercanos':
        // For demo purposes, we'll just shuffle
        tasks.shuffle();
        break;
    }

    return tasks;
  }

  void _showFilterDialog() {
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Filtros'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Text('Próximamente: más opciones de filtrado'),
            const SizedBox(height: 16),
            const Text('• Distancia máxima'),
            const Text('• Rango de presupuesto'),
            const Text('• Disponibilidad'),
            const Text('• Calificación mínima del cliente'),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Cerrar'),
          ),
        ],
      ),
    );
  }

  void _showTaskDetails(Map<String, dynamic> task) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      builder: (context) => DraggableScrollableSheet(
        initialChildSize: 0.7,
        maxChildSize: 0.9,
        minChildSize: 0.5,
        builder: (context, scrollController) => Container(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Center(
                child: Container(
                  width: 40,
                  height: 4,
                  decoration: BoxDecoration(
                    color: Colors.grey[300],
                    borderRadius: BorderRadius.circular(2),
                  ),
                ),
              ),
              const SizedBox(height: 16),
              Text(
                task['title'],
                style: const TextStyle(
                  fontSize: 24,
                  fontWeight: FontWeight.bold,
                ),
              ),
              const SizedBox(height: 8),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                decoration: BoxDecoration(
                  color: Colors.blue.shade100,
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Text(
                  task['category'],
                  style: TextStyle(
                    fontSize: 14,
                    color: Colors.blue.shade700,
                    fontWeight: FontWeight.w500,
                  ),
                ),
              ),
              const SizedBox(height: 16),
              Text(
                'Descripción',
                style: const TextStyle(
                  fontSize: 18,
                  fontWeight: FontWeight.bold,
                ),
              ),
              const SizedBox(height: 8),
              Text(
                task['description'],
                style: const TextStyle(fontSize: 16),
              ),
              const SizedBox(height: 16),
              Row(
                children: [
                  Expanded(
                    child: _buildDetailItem(
                      Icons.location_on,
                      'Ubicación',
                      task['location'],
                    ),
                  ),
                  Expanded(
                    child: _buildDetailItem(
                      Icons.access_time,
                      'Duración',
                      '${task['duration']} minutos',
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 16),
              Row(
                children: [
                  Expanded(
                    child: _buildDetailItem(
                      Icons.attach_money,
                      'Presupuesto',
                      '\$${task['budget'].toStringAsFixed(0)}',
                    ),
                  ),
                  Expanded(
                    child: _buildDetailItem(
                      Icons.star,
                      'Cliente',
                      '${task['clientRating']} (${task['clientTasks']} tareas)',
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 16),
              Text(
                'Habilidades requeridas',
                style: const TextStyle(
                  fontSize: 18,
                  fontWeight: FontWeight.bold,
                ),
              ),
              const SizedBox(height: 8),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: (task['skills'] as List<String>).map((skill) {
                  return Chip(
                    label: Text(skill),
                    backgroundColor: Colors.grey[100],
                  );
                }).toList(),
              ),
              const Spacer(),
              SizedBox(
                width: double.infinity,
                child: ElevatedButton.icon(
                  onPressed: () {
                    Navigator.pop(context);
                    _showBidDialog(task);
                  },
                  icon: const Icon(Icons.gavel),
                  label: const Text('Hacer Oferta'),
                  style: ElevatedButton.styleFrom(
                    padding: const EdgeInsets.symmetric(vertical: 16),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildDetailItem(IconData icon, String label, String value) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Icon(icon, size: 16, color: Colors.grey[600]),
            const SizedBox(width: 4),
            Text(
              label,
              style: TextStyle(
                fontSize: 14,
                color: Colors.grey[600],
                fontWeight: FontWeight.w500,
              ),
            ),
          ],
        ),
        const SizedBox(height: 4),
        Text(
          value,
          style: const TextStyle(
            fontSize: 16,
            fontWeight: FontWeight.bold,
          ),
        ),
      ],
    );
  }

  void _showBidDialog(Map<String, dynamic> task) {
    final bidController = TextEditingController();
    final messageController = TextEditingController();
    int estimatedDuration = task['duration'];

    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: Text('Oferta para: ${task['title']}'),
        content: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              TextFormField(
                controller: bidController,
                keyboardType: TextInputType.number,
                decoration: const InputDecoration(
                  labelText: 'Tu oferta',
                  prefixText: '\$',
                  border: OutlineInputBorder(),
                ),
              ),
              const SizedBox(height: 16),
              TextFormField(
                controller: messageController,
                maxLines: 3,
                decoration: const InputDecoration(
                  labelText: 'Mensaje para el cliente',
                  hintText: 'Explica por qué eres la mejor opción...',
                  border: OutlineInputBorder(),
                ),
              ),
              const SizedBox(height: 16),
              Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('Duración estimada: $estimatedDuration minutos'),
                  Slider(
                    value: estimatedDuration.toDouble(),
                    min: 30,
                    max: 480,
                    divisions: 18,
                    onChanged: (value) {
                      setState(() {
                        estimatedDuration = value.round();
                      });
                    },
                  ),
                ],
              ),
            ],
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Cancelar'),
          ),
          ElevatedButton(
            onPressed: () {
              if (bidController.text.isNotEmpty && messageController.text.isNotEmpty) {
                Navigator.pop(context);
                ScaffoldMessenger.of(context).showSnackBar(
                  const SnackBar(
                    content: Text('¡Oferta enviada! El cliente será notificado.'),
                    backgroundColor: Colors.green,
                  ),
                );
              }
            },
            child: const Text('Enviar Oferta'),
          ),
        ],
      ),
    );
  }
}


