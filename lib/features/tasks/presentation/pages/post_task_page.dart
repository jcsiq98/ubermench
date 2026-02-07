import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

class PostTaskPage extends ConsumerStatefulWidget {
  const PostTaskPage({super.key});

  @override
  ConsumerState<PostTaskPage> createState() => _PostTaskPageState();
}

class _PostTaskPageState extends ConsumerState<PostTaskPage> {
  final _formKey = GlobalKey<FormState>();
  final _titleController = TextEditingController();
  final _descriptionController = TextEditingController();
  final _budgetController = TextEditingController();
  final _locationController = TextEditingController();
  final _instructionsController = TextEditingController();

  String _selectedCategory = '';
  DateTime? _selectedDate;
  TimeOfDay? _selectedTime;
  int _estimatedDuration = 60; // minutes

  final List<Map<String, dynamic>> _categories = [
    {
      'name': 'Plomería',
      'icon': Icons.build,
      'color': Colors.blue,
      'skills': ['Reparación de grifos', 'Desagües', 'Instalación de tuberías']
    },
    {
      'name': 'Electricidad',
      'icon': Icons.electrical_services,
      'color': Colors.orange,
      'skills': ['Instalación de enchufes', 'Reparación de luces', 'Cableado']
    },
    {
      'name': 'Limpieza',
      'icon': Icons.cleaning_services,
      'color': Colors.green,
      'skills': ['Limpieza profunda', 'Limpieza post-construcción', 'Limpieza de oficinas']
    },
    {
      'name': 'Jardinería',
      'icon': Icons.local_florist,
      'color': Colors.lightGreen,
      'skills': ['Poda de árboles', 'Mantenimiento de jardines', 'Instalación de riego']
    },
    {
      'name': 'Carpintería',
      'icon': Icons.handyman,
      'color': Colors.brown,
      'skills': ['Reparación de muebles', 'Instalación de estantes', 'Trabajos de madera']
    },
    {
      'name': 'Pintura',
      'icon': Icons.format_paint,
      'color': Colors.purple,
      'skills': ['Pintura de interiores', 'Pintura de exteriores', 'Preparación de superficies']
    },
    {
      'name': 'Montaje de Muebles',
      'icon': Icons.chair,
      'color': Colors.indigo,
      'skills': ['Montaje de IKEA', 'Instalación de muebles', 'Desmontaje']
    },
    {
      'name': 'Mudanzas',
      'icon': Icons.local_shipping,
      'color': Colors.red,
      'skills': ['Mudanzas locales', 'Embalaje', 'Carga y descarga']
    },
  ];

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Publicar Tarea'),
        backgroundColor: Colors.blue,
        foregroundColor: Colors.white,
        actions: [
          TextButton(
            onPressed: _saveTask,
            child: const Text(
              'Publicar',
              style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold),
            ),
          ),
        ],
      ),
      body: Form(
        key: _formKey,
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              _buildSectionTitle('¿Qué necesitas hacer?'),
              const SizedBox(height: 16),
              _buildCategorySelection(),
              const SizedBox(height: 24),
              _buildSectionTitle('Detalles de la tarea'),
              const SizedBox(height: 16),
              _buildTitleField(),
              const SizedBox(height: 16),
              _buildDescriptionField(),
              const SizedBox(height: 16),
              _buildLocationField(),
              const SizedBox(height: 16),
              _buildInstructionsField(),
              const SizedBox(height: 24),
              _buildSectionTitle('Presupuesto y tiempo'),
              const SizedBox(height: 16),
              _buildBudgetField(),
              const SizedBox(height: 16),
              _buildDurationSlider(),
              const SizedBox(height: 16),
              _buildDateTimeSelection(),
              const SizedBox(height: 24),
              _buildTaskRabbitInfo(),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildSectionTitle(String title) {
    return Text(
      title,
      style: const TextStyle(
        fontSize: 18,
        fontWeight: FontWeight.bold,
        color: Colors.blue,
      ),
    );
  }

  Widget _buildCategorySelection() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text(
          'Categoría de servicio',
          style: TextStyle(fontSize: 16, fontWeight: FontWeight.w500),
        ),
        const SizedBox(height: 12),
        GridView.builder(
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
            crossAxisCount: 2,
            childAspectRatio: 2.5,
            crossAxisSpacing: 12,
            mainAxisSpacing: 12,
          ),
          itemCount: _categories.length,
          itemBuilder: (context, index) {
            final category = _categories[index];
            final isSelected = _selectedCategory == category['name'];
            
            return GestureDetector(
              onTap: () {
                setState(() {
                  _selectedCategory = category['name'];
                });
              },
              child: Container(
                decoration: BoxDecoration(
                  color: isSelected ? category['color'].withOpacity(0.1) : Colors.grey[100],
                  border: Border.all(
                    color: isSelected ? category['color'] : Colors.grey[300]!,
                    width: isSelected ? 2 : 1,
                  ),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Row(
                  children: [
                    const SizedBox(width: 8),
                    Icon(
                      category['icon'],
                      color: category['color'],
                      size: 20,
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Text(
                        category['name'],
                        style: TextStyle(
                          fontSize: 14,
                          fontWeight: isSelected ? FontWeight.bold : FontWeight.normal,
                          color: isSelected ? category['color'] : Colors.black87,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            );
          },
        ),
      ],
    );
  }

  Widget _buildTitleField() {
    return TextFormField(
      controller: _titleController,
      decoration: const InputDecoration(
        labelText: 'Título de la tarea',
        hintText: 'Ej: Reparar grifo de la cocina',
        border: OutlineInputBorder(),
        prefixIcon: Icon(Icons.title),
      ),
      validator: (value) {
        if (value == null || value.isEmpty) {
          return 'Por favor ingresa un título';
        }
        return null;
      },
    );
  }

  Widget _buildDescriptionField() {
    return TextFormField(
      controller: _descriptionController,
      maxLines: 4,
      decoration: const InputDecoration(
        labelText: 'Descripción detallada',
        hintText: 'Describe qué necesitas hacer, materiales necesarios, etc.',
        border: OutlineInputBorder(),
        prefixIcon: Icon(Icons.description),
      ),
      validator: (value) {
        if (value == null || value.isEmpty) {
          return 'Por favor ingresa una descripción';
        }
        return null;
      },
    );
  }

  Widget _buildLocationField() {
    return TextFormField(
      controller: _locationController,
      decoration: const InputDecoration(
        labelText: 'Ubicación',
        hintText: 'Dirección donde se realizará la tarea',
        border: OutlineInputBorder(),
        prefixIcon: Icon(Icons.location_on),
      ),
      validator: (value) {
        if (value == null || value.isEmpty) {
          return 'Por favor ingresa la ubicación';
        }
        return null;
      },
    );
  }

  Widget _buildInstructionsField() {
    return TextFormField(
      controller: _instructionsController,
      maxLines: 3,
      decoration: const InputDecoration(
        labelText: 'Instrucciones especiales (opcional)',
        hintText: 'Cualquier información adicional importante',
        border: OutlineInputBorder(),
        prefixIcon: Icon(Icons.info_outline),
      ),
    );
  }

  Widget _buildBudgetField() {
    return TextFormField(
      controller: _budgetController,
      keyboardType: TextInputType.number,
      decoration: const InputDecoration(
        labelText: 'Presupuesto estimado',
        hintText: '0.00',
        border: OutlineInputBorder(),
        prefixIcon: Icon(Icons.attach_money),
        suffixText: 'USD',
      ),
      validator: (value) {
        if (value == null || value.isEmpty) {
          return 'Por favor ingresa un presupuesto';
        }
        if (double.tryParse(value) == null) {
          return 'Por favor ingresa un número válido';
        }
        return null;
      },
    );
  }

  Widget _buildDurationSlider() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'Duración estimada: ${_estimatedDuration} minutos',
          style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w500),
        ),
        Slider(
          value: _estimatedDuration.toDouble(),
          min: 30,
          max: 480, // 8 hours
          divisions: 18,
          label: '${_estimatedDuration} min',
          onChanged: (value) {
            setState(() {
              _estimatedDuration = value.round();
            });
          },
        ),
        const Text(
          '30 min - 8 horas',
          style: TextStyle(fontSize: 12, color: Colors.grey),
        ),
      ],
    );
  }

  Widget _buildDateTimeSelection() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text(
          '¿Cuándo necesitas que se haga?',
          style: TextStyle(fontSize: 16, fontWeight: FontWeight.w500),
        ),
        const SizedBox(height: 12),
        Row(
          children: [
            Expanded(
              child: OutlinedButton.icon(
                onPressed: _selectDate,
                icon: const Icon(Icons.calendar_today),
                label: Text(_selectedDate == null 
                  ? 'Seleccionar fecha' 
                  : '${_selectedDate!.day}/${_selectedDate!.month}/${_selectedDate!.year}'),
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: OutlinedButton.icon(
                onPressed: _selectTime,
                icon: const Icon(Icons.access_time),
                label: Text(_selectedTime == null 
                  ? 'Seleccionar hora' 
                  : '${_selectedTime!.hour}:${_selectedTime!.minute.toString().padLeft(2, '0')}'),
              ),
            ),
          ],
        ),
      ],
    );
  }

  Widget _buildTaskRabbitInfo() {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.blue.shade50,
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: Colors.blue.shade200),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(Icons.info, color: Colors.blue.shade700),
              const SizedBox(width: 8),
              Text(
                'Cómo funciona',
                style: TextStyle(
                  fontSize: 16,
                  fontWeight: FontWeight.bold,
                  color: Colors.blue.shade700,
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          const Text(
            '1. Publica tu tarea con todos los detalles\n'
            '2. Los trabajadores verificados harán ofertas\n'
            '3. Revisa perfiles, calificaciones y precios\n'
            '4. Selecciona al trabajador que prefieras\n'
            '5. Paga de forma segura cuando termine el trabajo',
            style: TextStyle(fontSize: 14),
          ),
        ],
      ),
    );
  }

  Future<void> _selectDate() async {
    final date = await showDatePicker(
      context: context,
      initialDate: DateTime.now().add(const Duration(days: 1)),
      firstDate: DateTime.now(),
      lastDate: DateTime.now().add(const Duration(days: 30)),
    );
    if (date != null) {
      setState(() {
        _selectedDate = date;
      });
    }
  }

  Future<void> _selectTime() async {
    final time = await showTimePicker(
      context: context,
      initialTime: TimeOfDay.now(),
    );
    if (time != null) {
      setState(() {
        _selectedTime = time;
      });
    }
  }

  void _saveTask() {
    if (_formKey.currentState!.validate() && _selectedCategory.isNotEmpty) {
      // Aquí implementarías la lógica para guardar la tarea
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('¡Tarea publicada exitosamente! Los trabajadores podrán hacer ofertas.'),
          backgroundColor: Colors.green,
        ),
      );
      Navigator.pop(context);
    } else if (_selectedCategory.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Por favor selecciona una categoría'),
          backgroundColor: Colors.red,
        ),
      );
    }
  }

  @override
  void dispose() {
    _titleController.dispose();
    _descriptionController.dispose();
    _budgetController.dispose();
    _locationController.dispose();
    _instructionsController.dispose();
    super.dispose();
  }
}


