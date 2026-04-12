import React from "react";
import { StyleSheet, View } from "react-native";
import { BannerAd, BannerAdSize } from "react-native-google-mobile-ads";

import { AD_UNIT_IDS } from "@/src/ads/admobConfig";

export const BottomBannerAd = () => {
  return (
    <View style={styles.bannerWrap}>
      <BannerAd
        unitId={AD_UNIT_IDS.banner}
        size={BannerAdSize.BANNER}
        requestOptions={{ requestNonPersonalizedAdsOnly: true }}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  bannerWrap: {
    alignItems: "center",
    justifyContent: "center",
    borderTopWidth: 1,
    borderTopColor: "#1E293B",
    backgroundColor: "#080D1A",
    // paddingTop: 8,
    // paddingBottom: 6,
  },
});
