import 'package:freezed_annotation/freezed_annotation.dart';

part 'user_model.freezed.dart';
part 'user_model.g.dart';

@freezed
class UserModel with _$UserModel {
  const factory UserModel({
    required String id,
    required String name,
    required String email,
    required String phone,
    required UserRole role,
    @Default(0.0) double ratingAverage,
    @Default('') String profileImageUrl,
    required DateTime createdAt,
    DateTime? updatedAt,
  }) = _UserModel;

  factory UserModel.fromJson(Map<String, dynamic> json) => _$UserModelFromJson(json);
}

enum UserRole {
  @JsonValue('customer')
  customer,
  @JsonValue('provider')
  provider,
}

