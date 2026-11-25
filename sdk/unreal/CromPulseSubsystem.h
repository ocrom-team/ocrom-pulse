// Neocrom Pulse Unreal Engine SDK Adapter (v1 Wire Protocol)
// Drop-in UGameInstanceSubsystem blueprint for Unreal Engine 5.x.
#pragma once

#include "CoreMinimal.h"
#include "Subsystems/GameInstanceSubsystem.h"
#include "CromPulseSubsystem.generated.h"

USTRUCT(BlueprintType)
struct FCromPulseConsent
{
	GENERATED_BODY()

	UPROPERTY(BlueprintReadWrite, Category = "CromPulse") bool bDecided = false;
	UPROPERTY(BlueprintReadWrite, Category = "CromPulse") bool bGameplay = false;
	UPROPERTY(BlueprintReadWrite, Category = "CromPulse") bool bPerformance = false;
	UPROPERTY(BlueprintReadWrite, Category = "CromPulse") bool bErrors = false;
	UPROPERTY(BlueprintReadWrite, Category = "CromPulse") bool bHardware = false;
	UPROPERTY(BlueprintReadWrite, Category = "CromPulse") bool bPublicBenchmark = false;
};

UCLASS()
class CROMPULSE_API UCromPulseSubsystem : public UGameInstanceSubsystem
{
	GENERATED_BODY()

public:
	virtual void Initialize(FSubsystemCollectionBase& Collection) override;
	virtual void Deinitialize() override;

	UFUNCTION(BlueprintCallable, Category = "CromPulse")
	void SetConsent(const FCromPulseConsent& NewConsent);

	UFUNCTION(BlueprintCallable, Category = "CromPulse")
	void TrackEvent(const FString& EventName, const TMap<FString, FString>& Properties);

	UFUNCTION(BlueprintCallable, Category = "CromPulse")
	void ReportError(const FString& Message, const FString& Severity = TEXT("error"), const FString& Source = TEXT(""));

	UFUNCTION(BlueprintCallable, Category = "CromPulse")
	void Flush();

private:
	FString SessionId;
	FCromPulseConsent Consent;
	TArray<FString> QueuedEventsJson;
};
