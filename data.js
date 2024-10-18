const cheerio = require("cheerio");
const request = require("request");
const express = require("express");
const axios = require("axios");
const app = express();
const cors = require("cors");

const fetchVerbs = (wiki) => {
  return new Promise((resolve) => {
    axios
      .get(wiki)
      .then((response) => {
        const $$ = cheerio.load(response.data);
        const verb = $$("tr > td > p ").text();

        const lines = verb
          .split("\n")
          .map((line) => line.trim())
          .filter(Boolean);

        const verbs = [];
        for (let i = 0; i < lines.length; i += 2) {
          if (verbs.includes({ type: lines[i], text: lines[i + 1] })) {
            break;
          }
          const type = lines[i];
          const text = lines[i + 1];
          if (type && text) {
            verbs.push({ id: verbs.length, type, text });
          } else {
            verbs.push();
          }
        }
        resolve(verbs);
      })
      .catch((_error) => {
        resolve();
      });
  });
};

app.use(cors({ origin: "*" }));

app.get("/", (_req, res) => {
  res.sendFile(__dirname + "/index.html");
});

app.get("/api/dictionary/:language/:entry", (req, res) => {
  const entry = req.params.entry;
  const slugLanguage = req.params.language;
  let nation = "us";

  switch (slugLanguage) {
    case "en":
      language = "english";
      break;
    case "uk":
      language = "english";
      nation = "uk";
      break;
    case "en-pt":
      language = "english-portuguese";
      break;
    case "en-jp":
      language = "english-japanese";
      break;
    case "en-es":
      language = "english-spanish";
      break;
    case "es-en":
      language = "spanish-english";
      break;
    case "en-cn":
      language = "english-chinese-simplified";
      break;
    case "en-tw":
      language = "english-chinese-traditional";
      break;
    case "en-nl":
      language = "english-dutch";
      break;
    case "en-fr":
      language = "english-french";
      break;
    case "en-de":
      language = "english-german";
      break;
    case "en-id":
      language = "english-indonesian";
      break;
    case "en-it":
      language = "english-italian";
      break;
    case "en-no":
      language = "english-norwegian";
      break;
    case "en-pl":
      language = "english-polish";
      break;
    case "en-sv":
      language = "english-swedish";
      break;
  }

  const url = `https://dictionary.cambridge.org/${nation}/dictionary/${language}/${entry}`;
  request(url, async (error, response, html) => {
    if (!error && response.statusCode == 200) {
      const $ = cheerio.load(html);
      const siteurl = "https://dictionary.cambridge.org";
      const wiki = `https://simple.wiktionary.org/wiki/${entry}`;

      // get verbs

      const verbs = await fetchVerbs(wiki);

      // basic

      const word = $(".hw.dhw").first().text();
      const getPos = $(".pos.dpos") // part of speech
        .map((_index, element) => {
          return $(element).text();
        })
        .get();
      const pos = getPos.filter(
        (item, index) => getPos.indexOf(item) === index,
      );

      // Phonetics audios
      const audio = [];
      for (const s of $(".pos-header.dpos-h")) {
        const posNode = s.childNodes.find(
          (c) =>
            c.attribs && c.attribs.class && c.attribs.class.includes("dpos-g"),
        );
        if (!posNode || posNode.childNodes.length === 0) continue;
        const p = $(posNode.childNodes[0]).text();
        const nodes = s.childNodes.filter(
          (c) =>
            c.name === "span" &&
            c.attribs &&
            c.attribs.class &&
            c.attribs.class.includes("dpron-i"),
        );
        if (nodes.length === 0) continue;
        for (const node of nodes) {
          if (node.childNodes.length < 3) continue;
          const lang = $(node.childNodes[0]).text();
          const aud = node.childNodes[1].childNodes.find(
            (c) => c.name === "audio",
          );
          if (!aud) continue;
          const src = aud.childNodes.find((c) => c.name === "source");
          if (!src) continue;
          const url = siteurl + $(src).attr("src");
          const pron = $(node.childNodes[2]).text();
          audio.push({ pos: p, lang: lang, url: url, pron: pron });
        }
      }

      // definition & example
      const exampleCount = $(".def-body.ddef_b")
        .map((_index, element) => {
          const exampleElements = $(element).find(".examp.dexamp");
          return exampleElements.length;
        })
        .get();
      for (let i = 0; i < exampleCount.length; i++) {
        if (i == 0) {
          exampleCount[i] = exampleCount[i];
        } else {
          exampleCount[i] = exampleCount[i] + exampleCount[i - 1];
        }
      }

      const exampletrans = $(
        ".examp.dexamp > .trans.dtrans.dtrans-se.hdb.break-cj",
      ); // translation of the example
      const example = $(".examp.dexamp > .eg.deg")
        .map((index, element) => {
          return {
            id: index,
            text: $(element).text(),
            translation: exampletrans.eq(index).text(),
          };
        })
        .get();

      const source = (element) => {
        const defElement = $(element);
        const parentElement = defElement.closest(".pr.dictionary");
        const dataId = parentElement.attr("data-id");
        return dataId;
      };

      const defPos = (element) => {
        const defElement = $(element);
        const partOfSpeech = defElement
          .closest(".pr.entry-body__el")
          .find(".pos.dpos")
          .first()
          .text(); // Get the part of speech
        return partOfSpeech;
      };

      const getExample = (element) => {
        const ex = $(element)
          .find(".def-body.ddef_b > .examp.dexamp")
          .map((index, element) => {
            return {
              id: index,
              text: $(element).find(".eg.deg").text(),
              translation: $(element).find(".trans.dtrans").text(),
            };
          });
        return ex.get();
      };

      const definition = $(".def-block.ddef_block")
        .map((index, element) => {
          return {
            id: index,
            pos: defPos(element),
            source: source(element),
            text: $(element).find(".def.ddef_d.db").text(),
            translation: $(element)
              .find(".def-body.ddef_b > span.trans.dtrans")
              .text(),
            example: getExample(element),
          };
        })
        .get();

      // api response

      if (word === "") {
        res.status(404).json({
          error: "word not found",
        });
      } else {
        res.status(200).json({
          word: word,
          pos: pos,
          verbs: verbs,
          pronunciation: audio,
          definition: definition,
        });
      }
    }
  });
});
module.exports = app;
