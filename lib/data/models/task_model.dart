import 'package:freezed_annotation/freezed_annotation.dart';

part 'task_model.freezed.dart';
part 'task_model.g.dart';

@freezed
class Task with _$Task {
  const factory Task({
    required String id,
    required String title,
    required String description,
    required String category,
    required String clientId,
    String? taskerId,
    required double budget,
    required TaskStatus status,
    required DateTime createdAt,
    DateTime? scheduledAt,
    DateTime? completedAt,
    String? location,
    double? latitude,
    double? longitude,
    List<String>? images,
    List<String>? requiredSkills,
    int? estimatedDuration, // in minutes
    String? specialInstructions,
  }) = _Task;

  factory Task.fromJson(Map<String, dynamic> json) => _$TaskFromJson(json);
}

@freezed
class TaskBid with _$TaskBid {
  const factory TaskBid({
    required String id,
    required String taskId,
    required String taskerId,
    required double amount,
    required String message,
    required DateTime createdAt,
    required BidStatus status,
    int? estimatedDuration, // in minutes
    DateTime? availableFrom,
    DateTime? availableUntil,
  }) = _TaskBid;

  factory TaskBid.fromJson(Map<String, dynamic> json) => _$TaskBidFromJson(json);
}

@freezed
class Tasker with _$Tasker {
  const factory Tasker({
    required String id,
    required String userId,
    required String name,
    required String email,
    String? phone,
    String? profileImage,
    required List<String> skills,
    required List<String> categories,
    required double hourlyRate,
    required double rating,
    required int completedTasks,
    required int totalReviews,
    required TaskerStatus status,
    required DateTime joinedAt,
    DateTime? lastActiveAt,
    String? bio,
    List<String>? certifications,
    List<String>? portfolioImages,
    String? location,
    double? latitude,
    double? longitude,
    int? maxDistance, // in km
    List<String>? languages,
    bool? backgroundCheckVerified,
    bool? identityVerified,
  }) = _Tasker;

  factory Tasker.fromJson(Map<String, dynamic> json) => _$TaskerFromJson(json);
}

enum TaskStatus {
  @JsonValue('posted')
  posted,
  @JsonValue('bidding')
  bidding,
  @JsonValue('assigned')
  assigned,
  @JsonValue('in_progress')
  inProgress,
  @JsonValue('completed')
  completed,
  @JsonValue('cancelled')
  cancelled,
}

enum BidStatus {
  @JsonValue('pending')
  pending,
  @JsonValue('accepted')
  accepted,
  @JsonValue('rejected')
  rejected,
  @JsonValue('withdrawn')
  withdrawn,
}

enum TaskerStatus {
  @JsonValue('active')
  active,
  @JsonValue('inactive')
  inactive,
  @JsonValue('suspended')
  suspended,
  @JsonValue('pending_verification')
  pendingVerification,
}


