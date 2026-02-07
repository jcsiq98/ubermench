// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint
// ignore_for_file: unused_element, deprecated_member_use, deprecated_member_use_from_same_package, use_function_type_syntax_for_parameters, unnecessary_const, avoid_init_to_null, invalid_override_different_default_values_named, prefer_expression_function_bodies, annotate_overrides, invalid_annotation_target, unnecessary_question_mark

part of 'service_request_model.dart';

// **************************************************************************
// FreezedGenerator
// **************************************************************************

T _$identity<T>(T value) => value;

final _privateConstructorUsedError = UnsupportedError(
    'It seems like you constructed your class using `MyClass._()`. This constructor is only meant to be used by freezed and you are not supposed to need it nor use it.\nPlease check the documentation here for more information: https://github.com/rrousselGit/freezed#adding-getters-and-methods-to-our-models');

ServiceRequestModel _$ServiceRequestModelFromJson(Map<String, dynamic> json) {
  return _ServiceRequestModel.fromJson(json);
}

/// @nodoc
mixin _$ServiceRequestModel {
  String get id => throw _privateConstructorUsedError;
  String get customerId => throw _privateConstructorUsedError;
  ServiceType get serviceType => throw _privateConstructorUsedError;
  RequestStatus get status => throw _privateConstructorUsedError;
  double get originLat => throw _privateConstructorUsedError;
  double get originLng => throw _privateConstructorUsedError;
  String get address => throw _privateConstructorUsedError;
  String get description => throw _privateConstructorUsedError;
  double get priceEstimate => throw _privateConstructorUsedError;
  String? get providerId => throw _privateConstructorUsedError;
  DateTime? get acceptedAt => throw _privateConstructorUsedError;
  DateTime? get completedAt => throw _privateConstructorUsedError;
  DateTime get createdAt => throw _privateConstructorUsedError;
  DateTime? get updatedAt => throw _privateConstructorUsedError;

  Map<String, dynamic> toJson() => throw _privateConstructorUsedError;
  @JsonKey(ignore: true)
  $ServiceRequestModelCopyWith<ServiceRequestModel> get copyWith =>
      throw _privateConstructorUsedError;
}

/// @nodoc
abstract class $ServiceRequestModelCopyWith<$Res> {
  factory $ServiceRequestModelCopyWith(
          ServiceRequestModel value, $Res Function(ServiceRequestModel) then) =
      _$ServiceRequestModelCopyWithImpl<$Res, ServiceRequestModel>;
  @useResult
  $Res call(
      {String id,
      String customerId,
      ServiceType serviceType,
      RequestStatus status,
      double originLat,
      double originLng,
      String address,
      String description,
      double priceEstimate,
      String? providerId,
      DateTime? acceptedAt,
      DateTime? completedAt,
      DateTime createdAt,
      DateTime? updatedAt});
}

/// @nodoc
class _$ServiceRequestModelCopyWithImpl<$Res, $Val extends ServiceRequestModel>
    implements $ServiceRequestModelCopyWith<$Res> {
  _$ServiceRequestModelCopyWithImpl(this._value, this._then);

  // ignore: unused_field
  final $Val _value;
  // ignore: unused_field
  final $Res Function($Val) _then;

  @pragma('vm:prefer-inline')
  @override
  $Res call({
    Object? id = null,
    Object? customerId = null,
    Object? serviceType = null,
    Object? status = null,
    Object? originLat = null,
    Object? originLng = null,
    Object? address = null,
    Object? description = null,
    Object? priceEstimate = null,
    Object? providerId = freezed,
    Object? acceptedAt = freezed,
    Object? completedAt = freezed,
    Object? createdAt = null,
    Object? updatedAt = freezed,
  }) {
    return _then(_value.copyWith(
      id: null == id
          ? _value.id
          : id // ignore: cast_nullable_to_non_nullable
              as String,
      customerId: null == customerId
          ? _value.customerId
          : customerId // ignore: cast_nullable_to_non_nullable
              as String,
      serviceType: null == serviceType
          ? _value.serviceType
          : serviceType // ignore: cast_nullable_to_non_nullable
              as ServiceType,
      status: null == status
          ? _value.status
          : status // ignore: cast_nullable_to_non_nullable
              as RequestStatus,
      originLat: null == originLat
          ? _value.originLat
          : originLat // ignore: cast_nullable_to_non_nullable
              as double,
      originLng: null == originLng
          ? _value.originLng
          : originLng // ignore: cast_nullable_to_non_nullable
              as double,
      address: null == address
          ? _value.address
          : address // ignore: cast_nullable_to_non_nullable
              as String,
      description: null == description
          ? _value.description
          : description // ignore: cast_nullable_to_non_nullable
              as String,
      priceEstimate: null == priceEstimate
          ? _value.priceEstimate
          : priceEstimate // ignore: cast_nullable_to_non_nullable
              as double,
      providerId: freezed == providerId
          ? _value.providerId
          : providerId // ignore: cast_nullable_to_non_nullable
              as String?,
      acceptedAt: freezed == acceptedAt
          ? _value.acceptedAt
          : acceptedAt // ignore: cast_nullable_to_non_nullable
              as DateTime?,
      completedAt: freezed == completedAt
          ? _value.completedAt
          : completedAt // ignore: cast_nullable_to_non_nullable
              as DateTime?,
      createdAt: null == createdAt
          ? _value.createdAt
          : createdAt // ignore: cast_nullable_to_non_nullable
              as DateTime,
      updatedAt: freezed == updatedAt
          ? _value.updatedAt
          : updatedAt // ignore: cast_nullable_to_non_nullable
              as DateTime?,
    ) as $Val);
  }
}

/// @nodoc
abstract class _$$ServiceRequestModelImplCopyWith<$Res>
    implements $ServiceRequestModelCopyWith<$Res> {
  factory _$$ServiceRequestModelImplCopyWith(_$ServiceRequestModelImpl value,
          $Res Function(_$ServiceRequestModelImpl) then) =
      __$$ServiceRequestModelImplCopyWithImpl<$Res>;
  @override
  @useResult
  $Res call(
      {String id,
      String customerId,
      ServiceType serviceType,
      RequestStatus status,
      double originLat,
      double originLng,
      String address,
      String description,
      double priceEstimate,
      String? providerId,
      DateTime? acceptedAt,
      DateTime? completedAt,
      DateTime createdAt,
      DateTime? updatedAt});
}

/// @nodoc
class __$$ServiceRequestModelImplCopyWithImpl<$Res>
    extends _$ServiceRequestModelCopyWithImpl<$Res, _$ServiceRequestModelImpl>
    implements _$$ServiceRequestModelImplCopyWith<$Res> {
  __$$ServiceRequestModelImplCopyWithImpl(_$ServiceRequestModelImpl _value,
      $Res Function(_$ServiceRequestModelImpl) _then)
      : super(_value, _then);

  @pragma('vm:prefer-inline')
  @override
  $Res call({
    Object? id = null,
    Object? customerId = null,
    Object? serviceType = null,
    Object? status = null,
    Object? originLat = null,
    Object? originLng = null,
    Object? address = null,
    Object? description = null,
    Object? priceEstimate = null,
    Object? providerId = freezed,
    Object? acceptedAt = freezed,
    Object? completedAt = freezed,
    Object? createdAt = null,
    Object? updatedAt = freezed,
  }) {
    return _then(_$ServiceRequestModelImpl(
      id: null == id
          ? _value.id
          : id // ignore: cast_nullable_to_non_nullable
              as String,
      customerId: null == customerId
          ? _value.customerId
          : customerId // ignore: cast_nullable_to_non_nullable
              as String,
      serviceType: null == serviceType
          ? _value.serviceType
          : serviceType // ignore: cast_nullable_to_non_nullable
              as ServiceType,
      status: null == status
          ? _value.status
          : status // ignore: cast_nullable_to_non_nullable
              as RequestStatus,
      originLat: null == originLat
          ? _value.originLat
          : originLat // ignore: cast_nullable_to_non_nullable
              as double,
      originLng: null == originLng
          ? _value.originLng
          : originLng // ignore: cast_nullable_to_non_nullable
              as double,
      address: null == address
          ? _value.address
          : address // ignore: cast_nullable_to_non_nullable
              as String,
      description: null == description
          ? _value.description
          : description // ignore: cast_nullable_to_non_nullable
              as String,
      priceEstimate: null == priceEstimate
          ? _value.priceEstimate
          : priceEstimate // ignore: cast_nullable_to_non_nullable
              as double,
      providerId: freezed == providerId
          ? _value.providerId
          : providerId // ignore: cast_nullable_to_non_nullable
              as String?,
      acceptedAt: freezed == acceptedAt
          ? _value.acceptedAt
          : acceptedAt // ignore: cast_nullable_to_non_nullable
              as DateTime?,
      completedAt: freezed == completedAt
          ? _value.completedAt
          : completedAt // ignore: cast_nullable_to_non_nullable
              as DateTime?,
      createdAt: null == createdAt
          ? _value.createdAt
          : createdAt // ignore: cast_nullable_to_non_nullable
              as DateTime,
      updatedAt: freezed == updatedAt
          ? _value.updatedAt
          : updatedAt // ignore: cast_nullable_to_non_nullable
              as DateTime?,
    ));
  }
}

/// @nodoc
@JsonSerializable()
class _$ServiceRequestModelImpl implements _ServiceRequestModel {
  const _$ServiceRequestModelImpl(
      {required this.id,
      required this.customerId,
      required this.serviceType,
      required this.status,
      required this.originLat,
      required this.originLng,
      required this.address,
      this.description = '',
      this.priceEstimate = 0.0,
      this.providerId,
      this.acceptedAt,
      this.completedAt,
      required this.createdAt,
      this.updatedAt});

  factory _$ServiceRequestModelImpl.fromJson(Map<String, dynamic> json) =>
      _$$ServiceRequestModelImplFromJson(json);

  @override
  final String id;
  @override
  final String customerId;
  @override
  final ServiceType serviceType;
  @override
  final RequestStatus status;
  @override
  final double originLat;
  @override
  final double originLng;
  @override
  final String address;
  @override
  @JsonKey()
  final String description;
  @override
  @JsonKey()
  final double priceEstimate;
  @override
  final String? providerId;
  @override
  final DateTime? acceptedAt;
  @override
  final DateTime? completedAt;
  @override
  final DateTime createdAt;
  @override
  final DateTime? updatedAt;

  @override
  String toString() {
    return 'ServiceRequestModel(id: $id, customerId: $customerId, serviceType: $serviceType, status: $status, originLat: $originLat, originLng: $originLng, address: $address, description: $description, priceEstimate: $priceEstimate, providerId: $providerId, acceptedAt: $acceptedAt, completedAt: $completedAt, createdAt: $createdAt, updatedAt: $updatedAt)';
  }

  @override
  bool operator ==(Object other) {
    return identical(this, other) ||
        (other.runtimeType == runtimeType &&
            other is _$ServiceRequestModelImpl &&
            (identical(other.id, id) || other.id == id) &&
            (identical(other.customerId, customerId) ||
                other.customerId == customerId) &&
            (identical(other.serviceType, serviceType) ||
                other.serviceType == serviceType) &&
            (identical(other.status, status) || other.status == status) &&
            (identical(other.originLat, originLat) ||
                other.originLat == originLat) &&
            (identical(other.originLng, originLng) ||
                other.originLng == originLng) &&
            (identical(other.address, address) || other.address == address) &&
            (identical(other.description, description) ||
                other.description == description) &&
            (identical(other.priceEstimate, priceEstimate) ||
                other.priceEstimate == priceEstimate) &&
            (identical(other.providerId, providerId) ||
                other.providerId == providerId) &&
            (identical(other.acceptedAt, acceptedAt) ||
                other.acceptedAt == acceptedAt) &&
            (identical(other.completedAt, completedAt) ||
                other.completedAt == completedAt) &&
            (identical(other.createdAt, createdAt) ||
                other.createdAt == createdAt) &&
            (identical(other.updatedAt, updatedAt) ||
                other.updatedAt == updatedAt));
  }

  @JsonKey(ignore: true)
  @override
  int get hashCode => Object.hash(
      runtimeType,
      id,
      customerId,
      serviceType,
      status,
      originLat,
      originLng,
      address,
      description,
      priceEstimate,
      providerId,
      acceptedAt,
      completedAt,
      createdAt,
      updatedAt);

  @JsonKey(ignore: true)
  @override
  @pragma('vm:prefer-inline')
  _$$ServiceRequestModelImplCopyWith<_$ServiceRequestModelImpl> get copyWith =>
      __$$ServiceRequestModelImplCopyWithImpl<_$ServiceRequestModelImpl>(
          this, _$identity);

  @override
  Map<String, dynamic> toJson() {
    return _$$ServiceRequestModelImplToJson(
      this,
    );
  }
}

abstract class _ServiceRequestModel implements ServiceRequestModel {
  const factory _ServiceRequestModel(
      {required final String id,
      required final String customerId,
      required final ServiceType serviceType,
      required final RequestStatus status,
      required final double originLat,
      required final double originLng,
      required final String address,
      final String description,
      final double priceEstimate,
      final String? providerId,
      final DateTime? acceptedAt,
      final DateTime? completedAt,
      required final DateTime createdAt,
      final DateTime? updatedAt}) = _$ServiceRequestModelImpl;

  factory _ServiceRequestModel.fromJson(Map<String, dynamic> json) =
      _$ServiceRequestModelImpl.fromJson;

  @override
  String get id;
  @override
  String get customerId;
  @override
  ServiceType get serviceType;
  @override
  RequestStatus get status;
  @override
  double get originLat;
  @override
  double get originLng;
  @override
  String get address;
  @override
  String get description;
  @override
  double get priceEstimate;
  @override
  String? get providerId;
  @override
  DateTime? get acceptedAt;
  @override
  DateTime? get completedAt;
  @override
  DateTime get createdAt;
  @override
  DateTime? get updatedAt;
  @override
  @JsonKey(ignore: true)
  _$$ServiceRequestModelImplCopyWith<_$ServiceRequestModelImpl> get copyWith =>
      throw _privateConstructorUsedError;
}
