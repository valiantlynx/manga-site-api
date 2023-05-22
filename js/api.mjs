// this uses puppeteer to scrape the website, the problem is that puppeter needs chromium to be installed to run.
// turn imports into module imports
import { url } from './setupPocketbase.mjs';
import express from 'express';
import cors from 'cors';
import * as dotenv from 'dotenv';
import axios from 'axios';
import cheerio from 'cheerio';
import { create } from 'ipfs-http-client';
import { storeMangasData, storeMangaData, storeImagesData } from './storeData.mjs';
import { setupPuppeteer } from './puppeteer.mjs';

dotenv.config();
const ipfs = create()
const app = express();

const port = process.env.SCRAPE_API_PORT;
const hostURL = process.env.HOST_URL

app.use(cors());

const baseURL = "https://mangapark.net/";

app.get('/', async (req, res) => {
    const page = req.query.page || 100;

    const resultList = await axios.get(`${url}/api/collections/manga/records?page=${page}`, {
        headers: {
            'Content-Type': 'application/json',
        },
    })
        .then((res) => {
            return res.data;
        })
        .catch((error) => {
            console.error("error: ", error.message);
        });
    // send pocketbase data
    res.send(resultList);
});

app.get('/ipfs/:cid', async (req, res) => {
    const cid = req.params.cid;

    try {
        const chunks = [];
        for await (const chunk of ipfs.cat(cid)) {
            chunks.push(chunk);
        }
        const data = Buffer.concat(chunks);

        // Set the appropriate content type for the image
        res.set('Content-Type', 'image/png');

        // Process the data or send it as a response
        res.send(data);
    } catch (error) {
        console.error('Error retrieving IPFS data:', error);
        res.status(500).send('Error retrieving IPFS data');
    }
});

app.get('/api/browse/:page', async (req, res) => {
    let pageNo = req.params.page;

    try {
        console.log('currently on page', pageNo);

        const url = `${baseURL}browse?page=${pageNo}`;
        const response = await axios.get(url).catch((err) => {
            console.log("error: ", err.message);
        });
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
                title: titleElement.text().trim(),
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

        storeMangasData(scrapedData);

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
                titleid,
                id,
                mangaUrl: url
            };
        }).get();

        storeMangaData(data);

        res.json({ episodes: data });
    } catch (error) {
        console.error('Scraping failed', error.message);
        res.status(500).json({
            error: error.message,
            failure: error
        });
    }
});

app.get('/api/manga/:id/:titleid/:chapterid', async (req, res) => {
    let id = req.params.id;
    const titleid = req.params.titleid;
    let chapterid = req.params.chapterid;
    console.log("recieved dta:", id, titleid, chapterid);
    try {
        const chapterUrl = `${baseURL}comic/${id}/${titleid}/${chapterid}`;

        console.log("Navigating to: ", chapterUrl);

        const browser = await setupPuppeteer()
        const page = await browser.newPage();
        await page.setDefaultNavigationTimeout(2 * 60 * 1000);

        await page.goto(chapterUrl);

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

        storeImagesData({ 
            chapterid,
            titleid,
            id,
            chapterUrl,
            images: data,
        });

        res.json({ 
            chapterid,
            titleid,
            id,
            chapterUrl,
            images: data,
        });
    } catch (error) {
        console.error('Scraping failed', error);
        res.status(500).json({
            error: error.message,
            failure: error
        });
    }
});

app.listen(port, () => console.log(`running on ${port}`));
