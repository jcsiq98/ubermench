// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'provider_model.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

_$ProviderModelImpl _$$ProviderModelImplFromJson(Map<String, dynamic> json) =>
    _$ProviderModelImpl(
      id: json['id'] as String,
      userId: json['userId'] as String,
      serviceTypes: (json['serviceTypes'] as List<dynamic>)
          .map((e) => $enumDecode(_$ServiceTypeEnumMap, e))
          .toList(),
      isOnline: json['isOnline'] as bool,
      lat: (json['lat'] as num).toDouble(),
      lng: (json['lng'] as num).toDouble(),
      ratingAverage: (json['ratingAverage'] as num?)?.toDouble() ?? 0.0,
      totalJobs: (json['totalJobs'] as num?)?.toInt() ?? 0,
      bio: json['bio'] as String? ?? '',
      portfolioImages: (json['portfolioImages'] as List<dynamic>?)
              ?.map((e) => e as String)
              .toList() ??
          const [],
      lastSeenAt: json['lastSeenAt'] == null
          ? null
          : DateTime.parse(json['lastSeenAt'] as String),
      createdAt: DateTime.parse(json['createdAt'] as String),
      updatedAt: json['updatedAt'] == null
          ? null
          : DateTime.parse(json['updatedAt'] as String),
    );

Map<String, dynamic> _$$ProviderModelImplToJson(_$ProviderModelImpl instance) =>
    <String, dynamic>{
      'id': instance.id,
      'userId': instance.userId,
      'serviceTypes':
          instance.serviceTypes.map((e) => _$ServiceTypeEnumMap[e]!).toList(),
      'isOnline': instance.isOnline,
      'lat': instance.lat,
      'lng': instance.lng,
      'ratingAverage': instance.ratingAverage,
      'totalJobs': instance.totalJobs,
      'bio': instance.bio,
      'portfolioImages': instance.portfolioImages,
      'lastSeenAt': instance.lastSeenAt?.toIso8601String(),
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
