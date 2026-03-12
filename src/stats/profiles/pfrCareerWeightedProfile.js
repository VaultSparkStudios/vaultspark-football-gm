export const PFR_CAREER_WEIGHTED_PROFILE = {
  meta: {
    source: "Pro Football Reference career baseline",
    weighting: "Starter-qualified career averages by position",
    note:
      "Use the PFR ETL pipeline to generate a league-specific career profile for stricter verification."
  },
  positions: {
    QB: {
      minCareerSeasons: 3,
      minCareerGames: 80,
      qualifiers: {
        "careerStats.passing.att": 1200,
        "careerStats.gamesStarted": 85
      },
      metrics: {
        seasonsPlayed: 8.4,
        "careerStats.games": 118,
        "careerStats.passing.att": 4040,
        "careerStats.passing.cmp": 2580,
        "careerStats.passing.yards": 28850,
        "careerStats.passing.td": 184,
        "careerStats.passing.int": 90,
        "careerStats.passing.sacks": 246,
        "careerStats.rushing.yards": 1210,
        "careerStats.rushing.td": 10
      }
    },
    RB: {
      minCareerSeasons: 3,
      minCareerGames: 60,
      qualifiers: {
        "careerStats.rushing.att": 400
      },
      metrics: {
        seasonsPlayed: 6.2,
        "careerStats.games": 88,
        "careerStats.rushing.att": 1040,
        "careerStats.rushing.yards": 4480,
        "careerStats.rushing.td": 34,
        "careerStats.receiving.targets": 220,
        "careerStats.receiving.rec": 152,
        "careerStats.receiving.yards": 1260,
        "careerStats.receiving.td": 8
      }
    },
    WR: {
      minCareerSeasons: 3,
      minCareerGames: 70,
      qualifiers: {
        "careerStats.receiving.rec": 180
      },
      metrics: {
        seasonsPlayed: 7.5,
        "careerStats.games": 104,
        "careerStats.receiving.targets": 640,
        "careerStats.receiving.rec": 402,
        "careerStats.receiving.yards": 5530,
        "careerStats.receiving.td": 36
      }
    },
    TE: {
      minCareerSeasons: 3,
      minCareerGames: 70,
      qualifiers: {
        "careerStats.receiving.rec": 140
      },
      metrics: {
        seasonsPlayed: 8.1,
        "careerStats.games": 111,
        "careerStats.receiving.targets": 456,
        "careerStats.receiving.rec": 294,
        "careerStats.receiving.yards": 3360,
        "careerStats.receiving.td": 24
      }
    },
    OL: {
      minCareerSeasons: 4,
      minCareerGames: 90,
      qualifiers: {
        "careerStats.gamesStarted": 70
      },
      metrics: {
        seasonsPlayed: 8.3,
        "careerStats.games": 123,
        "careerStats.gamesStarted": 102
      }
    },
    DL: {
      minCareerSeasons: 3,
      minCareerGames: 75,
      qualifiers: {
        "careerStats.defense.tackles": 140
      },
      metrics: {
        seasonsPlayed: 7.9,
        "careerStats.games": 116,
        "careerStats.defense.tackles": 324,
        "careerStats.defense.sacks": 36,
        "careerStats.defense.passDefended": 21,
        "careerStats.defense.int": 2
      }
    },
    LB: {
      minCareerSeasons: 3,
      minCareerGames: 75,
      qualifiers: {
        "careerStats.defense.tackles": 260
      },
      metrics: {
        seasonsPlayed: 8.2,
        "careerStats.games": 118,
        "careerStats.defense.tackles": 612,
        "careerStats.defense.sacks": 20,
        "careerStats.defense.passDefended": 30,
        "careerStats.defense.int": 6
      }
    },
    DB: {
      minCareerSeasons: 3,
      minCareerGames: 80,
      qualifiers: {
        "careerStats.defense.tackles": 220
      },
      metrics: {
        seasonsPlayed: 8,
        "careerStats.games": 117,
        "careerStats.defense.tackles": 486,
        "careerStats.defense.sacks": 8,
        "careerStats.defense.passDefended": 72,
        "careerStats.defense.int": 16
      }
    },
    K: {
      minCareerSeasons: 4,
      minCareerGames: 90,
      qualifiers: {
        "careerStats.kicking.fga": 120
      },
      metrics: {
        seasonsPlayed: 10.4,
        "careerStats.games": 158,
        "careerStats.kicking.fga": 352,
        "careerStats.kicking.fgm": 302,
        "careerStats.kicking.xpa": 404,
        "careerStats.kicking.xpm": 383
      }
    },
    P: {
      minCareerSeasons: 4,
      minCareerGames: 90,
      qualifiers: {
        "careerStats.punting.punts": 220
      },
      metrics: {
        seasonsPlayed: 9.8,
        "careerStats.games": 150,
        "careerStats.punting.punts": 638,
        "careerStats.punting.yards": 29700,
        "careerStats.punting.in20": 235
      }
    }
  }
};
