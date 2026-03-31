import 'package:freezed_annotation/freezed_annotation.dart';

part 'service_request_model.freezed.dart';
part 'service_request_model.g.dart';

@freezed
class ServiceRequestModel with _$ServiceRequestModel {
  const factory ServiceRequestModel({
    required String id,
    required String customerId,
    required ServiceType serviceType,
    required RequestStatus status,
    required double originLat,
    required double originLng,
    required String address,
    @Default('') String description,
    @Default(0.0) double priceEstimate,
    String? providerId,
    DateTime? acceptedAt,
    DateTime? completedAt,
    required DateTime createdAt,
    DateTime? updatedAt,
  }) = _ServiceRequestModel;

  factory ServiceRequestModel.fromJson(Map<String, dynamic> json) => _$ServiceRequestModelFromJson(json);
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

enum RequestStatus {
  @JsonValue('created')
  created,
  @JsonValue('searching')
  searching,
  @JsonValue('provider_assigned')
  providerAssigned,
  @JsonValue('provider_arriving')
  providerArriving,
  @JsonValue('in_progress')
  inProgress,
  @JsonValue('completed')
  completed,
  @JsonValue('cancelled')
  cancelled,
  @JsonValue('paid')
  paid,
}

