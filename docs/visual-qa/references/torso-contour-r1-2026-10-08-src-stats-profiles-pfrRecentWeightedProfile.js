export const PFR_RECENT_WEIGHTED_PROFILE = {
  meta: {
    source: "Smoothed 2025 starter baseline",
    weighting: "2025 StatMuse/NFL starter-room sample, smoothed against modern multi-season outputs",
    note:
      "Defaults are used when no generated profile is supplied. This baseline blends 2025 starter-room samples with modern-era stability so one injury-heavy season does not overcorrect the live simulation."
  },
  positions: {
    QB: {
      depthPerTeam: 1,
      metrics: {
        "passing.att": 520,
        "passing.cmp": 337,
        "passing.yards": 3725,
        "passing.td": 25,
        "passing.int": 11,
        "passing.sacks": 35,
        "rushing.att": 48,
        "rushing.yards": 292,
        "rushing.td": 3
      }
    },
    RB: {
      depthPerTeam: 2,
      metrics: {
        "rushing.att": 170,
        "rushing.yards": 740,
        "rushing.td": 6,
        "receiving.targets": 42,
        "receiving.rec": 32,
        "receiving.yards": 244,
        "receiving.td": 2
      }
    },
    WR: {
      depthPerTeam: 3,
      metrics: {
        "receiving.targets": 92,
        "receiving.rec": 58,
        "receiving.yards": 732,
        "receiving.td": 5
      }
    },
    TE: {
      depthPerTeam: 1,
      metrics: {
        "receiving.targets": 82,
        "receiving.rec": 54,
        "receiving.yards": 620,
        "receiving.td": 5
      }
    },
    OL: {
      depthPerTeam: 5,
      metrics: {
        gamesStarted: 14.4
      }
    },
    DL: {
      depthPerTeam: 4,
      metrics: {
        "defense.tackles": 30,
        "defense.sacks": 5.1,
        "defense.passDefended": 1.9,
        "defense.int": 0.1
      }
    },
    LB: {
      depthPerTeam: 3,
      metrics: {
        "defense.tackles": 64,
        "defense.sacks": 2.8,
        "defense.passDefended": 4.0,
        "defense.int": 0.8
      }
    },
    DB: {
      depthPerTeam: 4,
      metrics: {
        "defense.tackles": 60,
        "defense.sacks": 0.8,
        "defense.passDefended": 8.9,
        "defense.int": 1.9
      }
    },
    K: {
      depthPerTeam: 1,
      metrics: {
        "kicking.fga": 35,
        "kicking.fgm": 30,
        "kicking.xpa": 38,
        "kicking.xpm": 36
      }
    },
    P: {
      depthPerTeam: 1,
      metrics: {
        "punting.punts": 60,
        "punting.yards": 2853,
        "punting.in20": 23
      }
    }
  }
};
