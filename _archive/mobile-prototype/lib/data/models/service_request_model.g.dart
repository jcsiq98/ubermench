// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'service_request_model.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

_$ServiceRequestModelImpl _$$ServiceRequestModelImplFromJson(
        Map<String, dynamic> json) =>
    _$ServiceRequestModelImpl(
      id: json['id'] as String,
      customerId: json['customerId'] as String,
      serviceType: $enumDecode(_$ServiceTypeEnumMap, json['serviceType']),
      status: $enumDecode(_$RequestStatusEnumMap, json['status']),
      originLat: (json['originLat'] as num).toDouble(),
      originLng: (json['originLng'] as num).toDouble(),
      address: json['address'] as String,
      description: json['description'] as String? ?? '',
      priceEstimate: (json['priceEstimate'] as num?)?.toDouble() ?? 0.0,
      providerId: json['providerId'] as String?,
      acceptedAt: json['acceptedAt'] == null
          ? null
          : DateTime.parse(json['acceptedAt'] as String),
      completedAt: json['completedAt'] == null
          ? null
          : DateTime.parse(json['completedAt'] as String),
      createdAt: DateTime.parse(json['createdAt'] as String),
      updatedAt: json['updatedAt'] == null
          ? null
          : DateTime.parse(json['updatedAt'] as String),
    );

Map<String, dynamic> _$$ServiceRequestModelImplToJson(
        _$ServiceRequestModelImpl instance) =>
    <String, dynamic>{
      'id': instance.id,
      'customerId': instance.customerId,
      'serviceType': _$ServiceTypeEnumMap[instance.serviceType]!,
      'status': _$RequestStatusEnumMap[instance.status]!,
      'originLat': instance.originLat,
      'originLng': instance.originLng,
      'address': instance.address,
      'description': instance.description,
      'priceEstimate': instance.priceEstimate,
      'providerId': instance.providerId,
      'acceptedAt': instance.acceptedAt?.toIso8601String(),
      'completedAt': instance.completedAt?.toIso8601String(),
      'createdAt': instance.createdAt.toIso8601String(),
      'updatedAt': instance.updatedAt?.toIso8601String(),
    };

const _$ServiceTypeEnumMap = {
  ServiceType.plumbing: 'plumbing',
  ServiceType.electrical: 'electrical',
  ServiceType.cleaning: 'cleaning',
  ServiceType.gardening: 'gardening',
  ServiceType.repair: 'repair',
  ServiceType.other: 'other',
};

const _$RequestStatusEnumMap = {
  RequestStatus.created: 'created',
  RequestStatus.searching: 'searching',
  RequestStatus.providerAssigned: 'provider_assigned',
  RequestStatus.providerArriving: 'provider_arriving',
  RequestStatus.inProgress: 'in_progress',
  RequestStatus.completed: 'completed',
  RequestStatus.cancelled: 'cancelled',
  RequestStatus.paid: 'paid',
};
