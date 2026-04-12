import { AD_UNIT_IDS } from '@/src/ads/admobConfig';
import { showToast } from '@/src/utils/toastHelper/toast';
import { useEffect, useState } from 'react';
import {
  RewardedAd,
  RewardedAdEventType,
} from 'react-native-google-mobile-ads';

export const useRewardedAd = () => {
  const [loaded, setLoaded] = useState(false);

  const rewarded = RewardedAd.createForAdRequest(
    AD_UNIT_IDS.rewarded
  );

  useEffect(() => {
    const unsubscribeLoaded = rewarded.addAdEventListener(
      RewardedAdEventType.LOADED,
      () => setLoaded(true)
    );

    const unsubscribeEarned = rewarded.addAdEventListener(
      RewardedAdEventType.EARNED_REWARD,
      (reward) => {
        console.log('User earned reward:', reward);
        showToast({ type: "success", message: "You earned bonus credits!" });
      }
    );

    rewarded.load();

    return () => {
      unsubscribeLoaded();
      unsubscribeEarned();
    };
  }, []);

  const showAd = () => {
    if (loaded) {
      rewarded.show();
    } else {
      console.log('Ad not ready');
    }
  };

  return { showAd, loaded };
};