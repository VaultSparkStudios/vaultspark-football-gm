export const PFR_RECENT_WEIGHTED_PROFILE = {
  meta: {
    source: "Pro Football Reference weighted baseline",
    weighting: "Recency-weighted toward modern passing era (2019+ emphasis)",
    note:
      "Defaults are used when no generated profile is supplied. For exact alignment, generate a profile from your own PFR scrape and load it at runtime."
  },
  positions: {
    QB: {
      depthPerTeam: 1,
      metrics: {
        "passing.att": 534,
        "passing.cmp": 347,
        "passing.yards": 3850,
        "passing.td": 25,
        "passing.int": 12,
        "passing.sacks": 33,
        "rushing.att": 44,
        "rushing.yards": 218,
        "rushing.td": 2
      }
    },
    RB: {
      depthPerTeam: 2,
      metrics: {
        "rushing.att": 162,
        "rushing.yards": 708,
        "rushing.td": 6,
        "receiving.targets": 43,
        "receiving.rec": 31,
        "receiving.yards": 241,
        "receiving.td": 2
      }
    },
    WR: {
      depthPerTeam: 3,
      metrics: {
        "receiving.targets": 88,
        "receiving.rec": 58,
        "receiving.yards": 761,
        "receiving.td": 5
      }
    },
    TE: {
      depthPerTeam: 1,
      metrics: {
        "receiving.targets": 77,
        "receiving.rec": 50,
        "receiving.yards": 578,
        "receiving.td": 4
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
        "defense.tackles": 45,
        "defense.sacks": 6.2,
        "defense.passDefended": 3.1,
        "defense.int": 0.3
      }
    },
    LB: {
      depthPerTeam: 3,
      metrics: {
        "defense.tackles": 91,
        "defense.sacks": 3.0,
        "defense.passDefended": 5.0,
        "defense.int": 1.0
      }
    },
    DB: {
      depthPerTeam: 4,
      metrics: {
        "defense.tackles": 68,
        "defense.sacks": 1.1,
        "defense.passDefended": 10.2,
        "defense.int": 2.1
      }
    },
    K: {
      depthPerTeam: 1,
      metrics: {
        "kicking.fga": 34,
        "kicking.fgm": 29,
        "kicking.xpa": 37,
        "kicking.xpm": 35
      }
    },
    P: {
      depthPerTeam: 1,
      metrics: {
        "punting.punts": 64,
        "punting.yards": 3005,
        "punting.in20": 24
      }
    }
  }
};
