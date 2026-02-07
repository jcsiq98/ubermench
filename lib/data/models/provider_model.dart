import 'package:freezed_annotation/freezed_annotation.dart';

part 'provider_model.freezed.dart';
part 'provider_model.g.dart';

@freezed
class ProviderModel with _$ProviderModel {
  const factory ProviderModel({
    required String id,
    required String userId,
    required List<ServiceType> serviceTypes,
    required bool isOnline,
    required double lat,
    required double lng,
    @Default(0.0) double ratingAverage,
    @Default(0) int totalJobs,
    @Default('') String bio,
    @Default([]) List<String> portfolioImages,
    DateTime? lastSeenAt,
    required DateTime createdAt,
    DateTime? updatedAt,
  }) = _ProviderModel;

  factory ProviderModel.fromJson(Map<String, dynamic> json) => _$ProviderModelFromJson(json);
}

enum ServiceType {
  @JsonValue('plumbing')
  plumbing,
  @JsonValue('electrical')
  electrical,
  @JsonValue('cleaning')
  cleaning,
  @JsonValue('gardening')
  gardening,
  @JsonValue('repair')
  repair,
  @JsonValue('other')
  other,
}

