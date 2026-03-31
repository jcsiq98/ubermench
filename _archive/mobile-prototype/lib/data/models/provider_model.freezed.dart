// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint
// ignore_for_file: unused_element, deprecated_member_use, deprecated_member_use_from_same_package, use_function_type_syntax_for_parameters, unnecessary_const, avoid_init_to_null, invalid_override_different_default_values_named, prefer_expression_function_bodies, annotate_overrides, invalid_annotation_target, unnecessary_question_mark

part of 'provider_model.dart';

// **************************************************************************
// FreezedGenerator
// **************************************************************************

T _$identity<T>(T value) => value;

final _privateConstructorUsedError = UnsupportedError(
    'It seems like you constructed your class using `MyClass._()`. This constructor is only meant to be used by freezed and you are not supposed to need it nor use it.\nPlease check the documentation here for more information: https://github.com/rrousselGit/freezed#adding-getters-and-methods-to-our-models');

ProviderModel _$ProviderModelFromJson(Map<String, dynamic> json) {
  return _ProviderModel.fromJson(json);
}

/// @nodoc
mixin _$ProviderModel {
  String get id => throw _privateConstructorUsedError;
  String get userId => throw _privateConstructorUsedError;
  List<ServiceType> get serviceTypes => throw _privateConstructorUsedError;
  bool get isOnline => throw _privateConstructorUsedError;
  double get lat => throw _privateConstructorUsedError;
  double get lng => throw _privateConstructorUsedError;
  double get ratingAverage => throw _privateConstructorUsedError;
  int get totalJobs => throw _privateConstructorUsedError;
  String get bio => throw _privateConstructorUsedError;
  List<String> get portfolioImages => throw _privateConstructorUsedError;
  DateTime? get lastSeenAt => throw _privateConstructorUsedError;
  DateTime get createdAt => throw _privateConstructorUsedError;
  DateTime? get updatedAt => throw _privateConstructorUsedError;

  Map<String, dynamic> toJson() => throw _privateConstructorUsedError;
  @JsonKey(ignore: true)
  $ProviderModelCopyWith<ProviderModel> get copyWith =>
      throw _privateConstructorUsedError;
}

/// @nodoc
abstract class $ProviderModelCopyWith<$Res> {
  factory $ProviderModelCopyWith(
          ProviderModel value, $Res Function(ProviderModel) then) =
      _$ProviderModelCopyWithImpl<$Res, ProviderModel>;
  @useResult
  $Res call(
      {String id,
      String userId,
      List<ServiceType> serviceTypes,
      bool isOnline,
      double lat,
      double lng,
      double ratingAverage,
      int totalJobs,
      String bio,
      List<String> portfolioImages,
      DateTime? lastSeenAt,
      DateTime createdAt,
      DateTime? updatedAt});
}

/// @nodoc
class _$ProviderModelCopyWithImpl<$Res, $Val extends ProviderModel>
    implements $ProviderModelCopyWith<$Res> {
  _$ProviderModelCopyWithImpl(this._value, this._then);

  // ignore: unused_field
  final $Val _value;
  // ignore: unused_field
  final $Res Function($Val) _then;

  @pragma('vm:prefer-inline')
  @override
  $Res call({
    Object? id = null,
    Object? userId = null,
    Object? serviceTypes = null,
    Object? isOnline = null,
    Object? lat = null,
    Object? lng = null,
    Object? ratingAverage = null,
    Object? totalJobs = null,
    Object? bio = null,
    Object? portfolioImages = null,
    Object? lastSeenAt = freezed,
    Object? createdAt = null,
    Object? updatedAt = freezed,
  }) {
    return _then(_value.copyWith(
      id: null == id
          ? _value.id
          : id // ignore: cast_nullable_to_non_nullable
              as String,
      userId: null == userId
          ? _value.userId
          : userId // ignore: cast_nullable_to_non_nullable
              as String,
      serviceTypes: null == serviceTypes
          ? _value.serviceTypes
          : serviceTypes // ignore: cast_nullable_to_non_nullable
              as List<ServiceType>,
      isOnline: null == isOnline
          ? _value.isOnline
          : isOnline // ignore: cast_nullable_to_non_nullable
              as bool,
      lat: null == lat
          ? _value.lat
          : lat // ignore: cast_nullable_to_non_nullable
              as double,
      lng: null == lng
          ? _value.lng
          : lng // ignore: cast_nullable_to_non_nullable
              as double,
      ratingAverage: null == ratingAverage
          ? _value.ratingAverage
          : ratingAverage // ignore: cast_nullable_to_non_nullable
              as double,
      totalJobs: null == totalJobs
          ? _value.totalJobs
          : totalJobs // ignore: cast_nullable_to_non_nullable
              as int,
      bio: null == bio
          ? _value.bio
          : bio // ignore: cast_nullable_to_non_nullable
              as String,
      portfolioImages: null == portfolioImages
          ? _value.portfolioImages
          : portfolioImages // ignore: cast_nullable_to_non_nullable
              as List<String>,
      lastSeenAt: freezed == lastSeenAt
          ? _value.lastSeenAt
          : lastSeenAt // ignore: cast_nullable_to_non_nullable
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
abstract class _$$ProviderModelImplCopyWith<$Res>
    implements $ProviderModelCopyWith<$Res> {
  factory _$$ProviderModelImplCopyWith(
          _$ProviderModelImpl value, $Res Function(_$ProviderModelImpl) then) =
      __$$ProviderModelImplCopyWithImpl<$Res>;
  @override
  @useResult
  $Res call(
      {String id,
      String userId,
      List<ServiceType> serviceTypes,
      bool isOnline,
      double lat,
      double lng,
      double ratingAverage,
      int totalJobs,
      String bio,
      List<String> portfolioImages,
      DateTime? lastSeenAt,
      DateTime createdAt,
      DateTime? updatedAt});
}

/// @nodoc
class __$$ProviderModelImplCopyWithImpl<$Res>
    extends _$ProviderModelCopyWithImpl<$Res, _$ProviderModelImpl>
    implements _$$ProviderModelImplCopyWith<$Res> {
  __$$ProviderModelImplCopyWithImpl(
      _$ProviderModelImpl _value, $Res Function(_$ProviderModelImpl) _then)
      : super(_value, _then);

  @pragma('vm:prefer-inline')
  @override
  $Res call({
    Object? id = null,
    Object? userId = null,
    Object? serviceTypes = null,
    Object? isOnline = null,
    Object? lat = null,
    Object? lng = null,
    Object? ratingAverage = null,
    Object? totalJobs = null,
    Object? bio = null,
    Object? portfolioImages = null,
    Object? lastSeenAt = freezed,
    Object? createdAt = null,
    Object? updatedAt = freezed,
  }) {
    return _then(_$ProviderModelImpl(
      id: null == id
          ? _value.id
          : id // ignore: cast_nullable_to_non_nullable
              as String,
      userId: null == userId
          ? _value.userId
          : userId // ignore: cast_nullable_to_non_nullable
              as String,
      serviceTypes: null == serviceTypes
          ? _value._serviceTypes
          : serviceTypes // ignore: cast_nullable_to_non_nullable
              as List<ServiceType>,
      isOnline: null == isOnline
          ? _value.isOnline
          : isOnline // ignore: cast_nullable_to_non_nullable
              as bool,
      lat: null == lat
          ? _value.lat
          : lat // ignore: cast_nullable_to_non_nullable
              as double,
      lng: null == lng
          ? _value.lng
          : lng // ignore: cast_nullable_to_non_nullable
              as double,
      ratingAverage: null == ratingAverage
          ? _value.ratingAverage
          : ratingAverage // ignore: cast_nullable_to_non_nullable
              as double,
      totalJobs: null == totalJobs
          ? _value.totalJobs
          : totalJobs // ignore: cast_nullable_to_non_nullable
              as int,
      bio: null == bio
          ? _value.bio
          : bio // ignore: cast_nullable_to_non_nullable
              as String,
      portfolioImages: null == portfolioImages
          ? _value._portfolioImages
          : portfolioImages // ignore: cast_nullable_to_non_nullable
              as List<String>,
      lastSeenAt: freezed == lastSeenAt
          ? _value.lastSeenAt
          : lastSeenAt // ignore: cast_nullable_to_non_nullable
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
class _$ProviderModelImpl implements _ProviderModel {
  const _$ProviderModelImpl(
      {required this.id,
      required this.userId,
      required final List<ServiceType> serviceTypes,
      required this.isOnline,
      required this.lat,
      required this.lng,
      this.ratingAverage = 0.0,
      this.totalJobs = 0,
      this.bio = '',
      final List<String> portfolioImages = const [],
      this.lastSeenAt,
      required this.createdAt,
      this.updatedAt})
      : _serviceTypes = serviceTypes,
        _portfolioImages = portfolioImages;

  factory _$ProviderModelImpl.fromJson(Map<String, dynamic> json) =>
      _$$ProviderModelImplFromJson(json);

  @override
  final String id;
  @override
  final String userId;
  final List<ServiceType> _serviceTypes;
  @override
  List<ServiceType> get serviceTypes {
    if (_serviceTypes is EqualUnmodifiableListView) return _serviceTypes;
    // ignore: implicit_dynamic_type
    return EqualUnmodifiableListView(_serviceTypes);
  }

  @override
  final bool isOnline;
  @override
  final double lat;
  @override
  final double lng;
  @override
  @JsonKey()
  final double ratingAverage;
  @override
  @JsonKey()
  final int totalJobs;
  @override
  @JsonKey()
  final String bio;
  final List<String> _portfolioImages;
  @override
  @JsonKey()
  List<String> get portfolioImages {
    if (_portfolioImages is EqualUnmodifiableListView) return _portfolioImages;
    // ignore: implicit_dynamic_type
    return EqualUnmodifiableListView(_portfolioImages);
  }

  @override
  final DateTime? lastSeenAt;
  @override
  final DateTime createdAt;
  @override
  final DateTime? updatedAt;

  @override
  String toString() {
    return 'ProviderModel(id: $id, userId: $userId, serviceTypes: $serviceTypes, isOnline: $isOnline, lat: $lat, lng: $lng, ratingAverage: $ratingAverage, totalJobs: $totalJobs, bio: $bio, portfolioImages: $portfolioImages, lastSeenAt: $lastSeenAt, createdAt: $createdAt, updatedAt: $updatedAt)';
  }

  @override
  bool operator ==(Object other) {
    return identical(this, other) ||
        (other.runtimeType == runtimeType &&
            other is _$ProviderModelImpl &&
            (identical(other.id, id) || other.id == id) &&
            (identical(other.userId, userId) || other.userId == userId) &&
            const DeepCollectionEquality()
                .equals(other._serviceTypes, _serviceTypes) &&
            (identical(other.isOnline, isOnline) ||
                other.isOnline == isOnline) &&
            (identical(other.lat, lat) || other.lat == lat) &&
            (identical(other.lng, lng) || other.lng == lng) &&
            (identical(other.ratingAverage, ratingAverage) ||
                other.ratingAverage == ratingAverage) &&
            (identical(other.totalJobs, totalJobs) ||
                other.totalJobs == totalJobs) &&
            (identical(other.bio, bio) || other.bio == bio) &&
            const DeepCollectionEquality()
                .equals(other._portfolioImages, _portfolioImages) &&
            (identical(other.lastSeenAt, lastSeenAt) ||
                other.lastSeenAt == lastSeenAt) &&
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
      userId,
      const DeepCollectionEquality().hash(_serviceTypes),
      isOnline,
      lat,
      lng,
      ratingAverage,
      totalJobs,
      bio,
      const DeepCollectionEquality().hash(_portfolioImages),
      lastSeenAt,
      createdAt,
      updatedAt);

  @JsonKey(ignore: true)
  @override
  @pragma('vm:prefer-inline')
  _$$ProviderModelImplCopyWith<_$ProviderModelImpl> get copyWith =>
      __$$ProviderModelImplCopyWithImpl<_$ProviderModelImpl>(this, _$identity);

  @override
  Map<String, dynamic> toJson() {
    return _$$ProviderModelImplToJson(
      this,
    );
  }
}

abstract class _ProviderModel implements ProviderModel {
  const factory _ProviderModel(
      {required final String id,
      required final String userId,
      required final List<ServiceType> serviceTypes,
      required final bool isOnline,
      required final double lat,
      required final double lng,
      final double ratingAverage,
      final int totalJobs,
      final String bio,
      final List<String> portfolioImages,
      final DateTime? lastSeenAt,
      required final DateTime createdAt,
      final DateTime? updatedAt}) = _$ProviderModelImpl;

  factory _ProviderModel.fromJson(Map<String, dynamic> json) =
      _$ProviderModelImpl.fromJson;

  @override
  String get id;
  @override
  String get userId;
  @override
  List<ServiceType> get serviceTypes;
  @override
  bool get isOnline;
  @override
  double get lat;
  @override
  double get lng;
  @override
  double get ratingAverage;
  @override
  int get totalJobs;
  @override
  String get bio;
  @override
  List<String> get portfolioImages;
  @override
  DateTime? get lastSeenAt;
  @override
  DateTime get createdAt;
  @override
  DateTime? get updatedAt;
  @override
  @JsonKey(ignore: true)
  _$$ProviderModelImplCopyWith<_$ProviderModelImpl> get copyWith =>
      throw _privateConstructorUsedError;
}
