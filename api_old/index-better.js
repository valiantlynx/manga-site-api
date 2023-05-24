require('dotenv').config();
const app = require("express")();
const cors = require("cors");
const axios = require("axios");
const cheerio = require("cheerio");
const puppeteer = require("puppeteer");

const port = process.env.PORT || 3000;
const hostURL = process.env.HOST_URL;
const browserlessURL = process.env.BROWSERLESS_URL;

app.use(cors());

const baseURL = "https://mangapark.net/";

app.get('/api/browse/:page', async (req, res) => {
  let pageNo = req.params.page;
  try {
    console.log('currently on page', pageNo);

    const url = `${baseURL}browse?page=${pageNo}`;
    const response = await axios.get(url).catch((err) => {
      console.log("error: ", err.message, err.response, err.response.data, err.data, err.status);
    });

    console.log("response -- : ", response.status, response.data);
    const $ = cheerio.load(response.data);

    const scrapedData = [];

    $('.pb-3').each((index, element) => {
      const titleElement = $(element).find('.fw-bold');
      const imgElement = $(element).find('img');
      const tagsElement = $(element).find('.genres');
      const chaptersElement = $(element).find('.text-ellipsis-1');
      const srcElement = $(element).find('a');
      const descriptionElement = $(element).find('.limit-html');
      const authorElement = $(element).find('.autarts');

      // Extract the ID and title ID from the src URL
      const src = srcElement.attr('href');
      const id = src ? src.split('/').slice(-2, -1)[0] : null;
      const titleId = src ? src.split('/').slice(-1)[0] : null;

      const content = {
        title: titleElement.text(),
        img: imgElement.attr('src'),
        tags: tagsElement.text(),
        latestChapter: chaptersElement.text(),
        src,
        id,
        titleId,
        description: descriptionElement.text(),
        author: authorElement.length
          ? [authorElement.text(), authorElement.find('a').attr('href')]
          : null,
      };

      scrapedData.push(content);
    });

    res.json({
      page: pageNo,
      mangas: scrapedData,
    });
  } catch (error) {
    console.error('Scraping failed', error.message);
    res.status(500).json({
      error: error.message,
      failure: error
    });
  }
});

app.get('/api/manga/:id/:titleid', async (req, res) => {
  let id = req.params.id;
  let titleid = req.params.titleid;
  try {
    const url = `${baseURL}comic/${id}/${titleid}`;

    console.log("Navigating to: ", url);

    const response = await axios.get(url, {
      headers: {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/89.0.4389.82 Safari/537.36',
          'Referer': 'https://mangapark.net/',
        },
      }
    });
    const $ = cheerio.load(response.data);

    const elements = $('.episode-item');
    const data = elements.map((index, element) => {
      const srcElement = $(element).find('a');

      // Extract the chapter ID from the src URL
      const src = srcElement.attr('href');
      const chapterId = src ? src.split('/').slice(-1)[0].split('-')[0] : null;

      return {
        src,
        chapterId,
        chapterTitle: srcElement.text(),
      };
    }).get();

    res.json({ episodes: data });
  } catch (error) {
    console.error('Scraping failed', error.message);
    res.status(500).json({
      error: error.message,
      failure: error
    });
  }
});

// app.get('/api/manga/:id/:titleid/:chapterid', async (req, res) => {
//   let id = req.params.id;
//   let titleid = req.params.titleid;
//   let chapterid = req.params.chapterid;
//   try {
//     const url = `${baseURL}comic/${id}/${titleid}/${chapterid}`;

//     console.log("Navigating to: ", url);

//     const response = await axios.get(url);
//     const $ = cheerio.load(response.data);

//     // after here i need to click a button to get the images
//     const elements = $('.item');

//     const data = elements.map((index, element) => {
//       const imgElement = $(element).find('img');
//       const pageElement = $(element).find('.page-num');

//       const imageUrl = imgElement.attr('src');
//       const chapterText = pageElement.text();
//       const pageNumber = pageElement ? Number(pageElement.text().split(' / ')[0]) : null;
//       const totalPages = pageElement ? Number(pageElement.text().split(' / ')[1]) : null;

//       console.log("response.data", imageUrl, pageNumber, totalPages, chapterText);

//       return {
//         imageUrl,
//         pageNumber,
//         totalPages,
//         chapterText,
//       };
//     }).get();

//     res.json({ images: data });
//   } catch (error) {
//     console.error('Scraping failed', error);
//     res.status(500).send('Scraping failed');
//   }
// });

app.get('/api/manga/:id/:titleid/:chapterid', async (req, res) => {
  let id = req.params.id;
  let titleid = req.params.titleid;
  let chapterid = req.params.chapterid;
  console.log("recieved dta:", id, titleid, chapterid);
  try {
    url = `${baseURL}comic/${id}/${titleid}/${chapterid}`;

    console.log("Navigating to: ", url);
    const endpoint = browserlessURL;

    const browser = await puppeteer.connect({
      browserWSEndpoint: endpoint,
    });
    // const browser = await puppeteer.launch({ headless: "false" });
    const page = await browser.newPage();
    await page.setDefaultNavigationTimeout(2 * 60 * 1000);


    await page.goto(url);

    await page.click('.ms-1')

    const elements = Array.from(await page.$$("#viewer .item"));
    const data = await Promise.all(
      elements.map(async (imageBody) => {
        const content = await imageBody.evaluate((e) => {
          const imgElement = e.querySelector('img');
          const pageElement = e.querySelector('.page-num');

          const imageUrl = imgElement ? imgElement.src : null;
          const chapterText = pageElement ? pageElement.innerText : null;
          const pageNumber = pageElement ? Number(pageElement.innerText.split(' / ')[0]) : null;
          const totalPages = pageElement ? Number(pageElement.innerText.split(' / ')[1]) : null;

          return {
            imageUrl,
            pageNumber,
            totalPages,
            chapterText,
          };
        });

        return content;
      })
    );

    await browser.close();

    res.json({ images: data });
  } catch (error) {
    console.error('Scraping failed', error.message);
    res.status(500).json({
      error: error.message,
      failure: error
    });
  }
});


app.get("/api/home", (req, res) => {
  let info = {
    browse: { recipe: `${hostURL}/api/browse/:page`, test: `${hostURL}/api/browse/2` },
    manga: { recipe: `${hostURL}/api/manga/:id/:titleid`, test: `${hostURL}/api/manga/75577/solo-leveling` },
    mangaChapter: { recipe: `${hostURL}/api/manga/:id/:titleid/:chapterid`, test: `${hostURL}/api/manga/75577/solo-leveling/c197` },
    docs: { recipe: `${hostURL}/api/docs`, test: `${hostURL}/api/docs` }
  };
  res.send(info);
});

app.get("/api/docs", (req, res) => {
  const welcomeMessage = "Welcome to AnimeVariant API!";
  const apiInfo = {
    version: "1.0.0",
    author: "Valiantlynx",
    description: "An API for accessing anime information and resources.",
    endpoints: [
      {
        path: "/api/home",
        description: "Get information about available API endpoints. They are also listed here.",
        params: {}
      },
      {
        path: "/api/browse/:page",
        description: "Get a list of manga titles. The page parameter is optional and defaults to 1.",
        params: {
          page: "The page number to get manga titles from."
        }
      },
      {
        path: "/api/manga/:id/:titleid",
        description: "Get a list of chapters for a manga title.",
        params: {
          id: "The ID of the manga title.",
          titleid: "The title ID of the manga title."
        }
      },
      {
        path: "/api/manga/:id/:titleid/:chapterid",
        description: "Get a list of images for a manga chapter.",
        params: {
          id: "The ID of the manga title.",
          titleid: "The title ID of the manga title.",
          chapterid: "The chapter ID of the manga chapter."
        }
      },
    ],
  };

  const response = {
    message: welcomeMessage,
    api: apiInfo,
  };

  res.send(response);
});

app.listen(port, () => console.log(`running on ${port}`));

module.exports = app;
