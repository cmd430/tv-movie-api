const async = require("async-q"),
  Show = require("../models/Show"),
  trakt = require("../lib/trakt"),
  config = require("../config"),
  colors = require("colors/safe"),
  util = require("../util");
let name;

/* Update a given show (doc) with it's associated episodes. */
const updateEpisodes = function*(doc) {
  const found = yield Show.findOne({
    _id: doc._id
  }).exec();
  if (found) {
    console.log(name + ": '" + (config.colorOutput ? colors.cyan(found.title) : found.title) + "' is an existing show.");
    for (let i = 0; i < found.episodes.length; i++) {
      let matching = doc.episodes.filter((docEpisode) => {
        return docEpisode.season === found.episodes[i].season && docEpisode.episode === found.episodes[i].episode;
      });

      if (matching.length != 0) {
        let index = doc.episodes.indexOf(matching[0]);
        if ((!matching[0].torrents["480p"] && found.episodes[i].torrents["480p"]) || (matching[0].torrents["480p"] && found.episodes[i].torrents["480p"] && matching[0].torrents["480p"].seeds < found.episodes[i].torrents["480p"].seeds) || (matching[0].torrents["480p"] && found.episodes[i].torrents["480p"] && matching[0].torrents["480p"].magnet === found.episodes[i].torrents["480p"].magnet)) {
          matching[0].torrents["0"] = found.episodes[i].torrents["480p"];
          matching[0].torrents["480p"] = found.episodes[i].torrents["480p"];
        }
        if ((!matching[0].torrents["720p"] && found.episodes[i].torrents["720p"]) || (matching[0].torrents["720p"] && found.episodes[i].torrents["720p"] && matching[0].torrents["720p"].seeds < found.episodes[i].torrents["720p"].seeds) || (matching[0].torrents["720p"] && found.episodes[i].torrents["720p"] && matching[0].torrents["720p"].magnet === found.episodes[i].torrents["720p"].magnet)) {
          matching[0].torrents["720p"] = found.episodes[i].torrents["720p"];
        }
        if ((!matching[0].torrents["1080p"] && found.episodes[i].torrents["1080p"]) || (matching[0].torrents["1080p"] && found.episodes[i].torrents["1080p"] && matching[0].torrents["1080p"].seeds < found.episodes[i].torrents["1080p"].seeds) || (matching[0].torrents["1080p"] && found.episodes[i].torrents["1080p"] && matching[0].torrents["1080p"].magnet === found.episodes[i].torrents["1080p"].magnet)) {
          matching[0].torrents["1080p"] = found.episodes[i].torrents["1080p"];
        }
        doc.episodes.splice(index, 1, matching[0]);
      } else {
        doc.episodes.push(found.episodes[i]);
      }
    }

    const saved = yield Show.findOneAndUpdate({
      _id: doc._id
    }, doc).exec();
    const distinct = yield Show.distinct("episodes.season", {
      _id: saved._id
    }).exec();
    saved.num_seasons = distinct.length;
    return yield saved.save();
  } else {
    console.log(name + ": '" + (config.colorOutput ? colors.cyan(doc.title) : doc.title) + "' is a new show!");
    return yield new Show(doc).save();
  }
};

/* Adds one season to a show. */
const addSeason = function*(doc, episodes, season_no, slug) {
  season_no = parseInt(season_no);
  if (!isNaN(season_no) && season_no.toString().length < 4) {
    const season = yield trakt.getSeason(slug, season_no)
    for (let episode_data in season) {
      episode_data = season[episode_data];
      if (typeof(episodes[season_no]) !== "undefined" && typeof(episodes[season_no][episode_data.number]) !== "undefined") {
        const episode = {
          tvdb_id: episode_data.ids["tvdb"],
          season: episode_data.season,
          episode: episode_data.number,
          title: episode_data.title,
          overview: episode_data.overview,
          date_based: false,
          first_aired: new Date(episode_data.first_aired).getTime() / 1000.0,
          watched: {
            watched: false
          },
          torrents: []
        };

        episode.torrents = episodes[season_no][episode_data.number];
        episode.torrents[0] = episodes[season_no][episode_data.number]["480p"] ? episodes[season_no][episode_data.number]["480p"] : episodes[season_no][episode_data.number]["720p"]; // Prevents breaking the app
        doc.episodes.push(episode);
      }
    }
  }
};

const Helper = (_name) => {

  name = _name;

  return {

    /* Adds episodes to a document. */
    addEpisodes: (show, episodes, slug) => {
      return async.each(Object.keys(episodes), (seasonNumber) => {
        return util.spawn(addSeason(show, episodes, seasonNumber, slug));
      }).then((value) => {
        return util.spawn(updateEpisodes(show));
      });
    },

    /* Get info from Trakt and make a new show object. */
    getTraktInfo: function*(slug) {
      const traktShow = yield trakt.getShow(slug);
      const traktWatchers = yield trakt.getShowWatching(slug);
      if (traktShow.ids["imdb"]) {
        return {
          _id: traktShow.ids["imdb"],
          imdb_id: traktShow.ids["imdb"],
          tvdb_id: traktShow.ids["tvdb"],
          title: traktShow.title,
          year: traktShow.year,
          slug: slug,
          synopsis: traktShow.overview,
          runtime: traktShow.runtime,
          rating: {
            hated: 100,
            loved: 100,
            votes: traktShow.votes,
            watching: traktWatchers.length,
            percentage: Math.round(traktShow.rating * 10)
          },
          country: traktShow.country,
          network: traktShow.network,
          air_day: traktShow.airs.day,
          air_time: traktShow.airs.time,
          status: traktShow.status,
          num_seasons: 0,
          last_updated: Number(new Date()),
          images: {
            fanart: traktShow.images.fanart.full != null ? traktShow.images.fanart.full : "app://host/img/placeholder.png",
            poster: traktShow.images.poster.full != null ? traktShow.images.poster.full : "app://host/img/placeholder_fanart.png",
            banner: traktShow.images.banner.full != null ? traktShow.images.banner.full : "app://host/img/placeholder_banner.png"
          },
          genres: traktShow.genres.length != 0 ? traktShow.genres : ["Unknown"],
          episodes: []
        }
      }
    }

  };

};

module.exports = Helper;
