// Neocrom Pulse Unreal Engine SDK Adapter (v1 Wire Protocol)
// Drop-in UGameInstanceSubsystem blueprint for Unreal Engine 5.x.
#pragma once

#include "CoreMinimal.h"
#include "Subsystems/GameInstanceSubsystem.h"
#include "NeocromPulseSubsystem.generated.h"

USTRUCT(BlueprintType)
struct FNeocromPulseConsent
{
	GENERATED_BODY()

	UPROPERTY(BlueprintReadWrite, Category = "NeocromPulse") bool bDecided = false;
	UPROPERTY(BlueprintReadWrite, Category = "NeocromPulse") bool bGameplay = false;
	UPROPERTY(BlueprintReadWrite, Category = "NeocromPulse") bool bPerformance = false;
	UPROPERTY(BlueprintReadWrite, Category = "NeocromPulse") bool bErrors = false;
	UPROPERTY(BlueprintReadWrite, Category = "NeocromPulse") bool bHardware = false;
	UPROPERTY(BlueprintReadWrite, Category = "NeocromPulse") bool bPublicBenchmark = false;
};

UCLASS()
class NEOCROMPULSE_API UNeocromPulseSubsystem : public UGameInstanceSubsystem
{
	GENERATED_BODY()

public:
	virtual void Initialize(FSubsystemCollectionBase& Collection) override;
	virtual void Deinitialize() override;

	UFUNCTION(BlueprintCallable, Category = "NeocromPulse")
	void SetConsent(const FNeocromPulseConsent& NewConsent);

	UFUNCTION(BlueprintCallable, Category = "NeocromPulse")
	void TrackEvent(const FString& EventName, const TMap<FString, FString>& Properties);

	UFUNCTION(BlueprintCallable, Category = "NeocromPulse")
	void ReportError(const FString& Message, const FString& Severity = TEXT("error"), const FString& Source = TEXT(""));

	UFUNCTION(BlueprintCallable, Category = "NeocromPulse")
	void Flush();

private:
	FString SessionId;
	FNeocromPulseConsent Consent;
	TArray<FString> QueuedEventsJson;
};
