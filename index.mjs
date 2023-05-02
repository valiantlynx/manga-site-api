import puppeteer from "puppeteer"; // 'puppeteer' if not using browserless and 'puppeteer-core' if using browserless
// import { downloadChapter } from "./downloadChapter";
// import { downloadManga } from "./downloadManga";

import PocketBase from "pocketbase";
import fetch from "node-fetch";
import fs from "fs";
import axios from "axios";

async function generateId() {
    let id = '';
    const length = 15;
    const characters = 'abcdefghijklmnopqrstuvwxyz0123456789';

    do {
        for (let i = 0; i < length; i++) {
            const randomIndex = Math.floor(Math.random() * characters.length);
            id += characters[randomIndex];
        }
    } while (await idAlreadyExistsInDatabase(id));

    return id;
}

async function idAlreadyExistsInDatabase(id) {
    // fetch all records from the database
    const records = await axios.get(`http://localhost:8080/api/collections/users/records?sort=&filter=id="${id}"`,
        {
            headers: {
                'Content-Type': 'application/json',
            }
        }
    ).then((res) => {
        // console.log(res.data);
        return res.data;
    }).catch((err) => {
        // console.log(err.message);
        return err.message;
    });

    return records.items.some(record => record.id === id);
}

async function run() {
    let browser;
    const pageNumber = 2;
    // const endpoint = 'wss://chrome.browserless.io?token=7fc44ee7-19d6-4da4-9bde-5b445b58414c';

    // loop through the pages and get the manga list from each page starting from page pageNumber to the last page, the last page is unknown
    for (let i = pageNumber; i <= 2550; i++) {

        console.log("currently on page", i);

        // test url 
        //const url = `https://bot.sannysoft.com/`;
        const url = `https://mangapark.net/browse?page=${i}`;
        console.log("url", url);
        try {

            // browser = await puppeteer.connect({
            //     browserWSEndpoint: endpoint,
            // });

            // 'false' makes the browser visible and it does not look like a robot, 
            // 'true' makes the browser invisible and it looks like a robot
            // 'new' makes the browser invisible and it does not look like a robot,
            browser = await puppeteer.launch({ headless: "new" });

            const page = await browser.newPage();
            await page.setDefaultNavigationTimeout(2 * 60 * 1000);

            // go to the url and get the manga list
            await page.goto(url);
            await page.screenshot({ path: "screenshot.png" });

            await page.waitForSelector("#subject-list");

            const mangas = Array.from(await page.$$(".pb-3"));
            const data = await Promise.all(
                mangas.map(async (manga) => {

                    const content = await manga.evaluate(async (e) => {
                        const titleElement = e.querySelector('.fw-bold')
                        const imgElement = e.querySelector('img')
                        const tagsElement = e.querySelector('.genres')
                        const chaptersElement = e.querySelector('.text-ellipsis-1')
                        const srcElement = e.querySelector('a')
                        const descriptionElement = e.querySelector('.limit-html')
                        const authorElement = e.querySelector('.autarts')

                        return {
                            title: titleElement ? titleElement.innerText : null,
                            img: imgElement ? imgElement.getAttribute('src') : null,
                            tags: tagsElement ? tagsElement.innerText : null,
                            latestChapter: chaptersElement ? chaptersElement.innerText : null,
                            src: srcElement ? srcElement.href : null,
                            description: descriptionElement ? descriptionElement.innerText : null,
                            author: authorElement ? [authorElement.innerText, authorElement.querySelector('a').href] : null, // [name, link] might use the link later to get more info
                        };
                    });

                    return content;
                })
            );

            console.log("data new", JSON.stringify(data[0], null, 2));

            let mangaData = {}

            const delay = (ms) => new Promise((res) => setTimeout(res, ms));


            // go to each manga page and get the image
            for (const manga of data) {
                console.log("Navigating to: ", manga.src);
                await page.goto(manga.src);
                await delay(1000);

                const elements = Array.from(await page.$$(".episode-item"));
                const data = await Promise.all(
                    elements.map(async (chapterBody) => {
                        const content = await chapterBody.evaluate((e) => {
                            const srcElement = e.querySelector('a')

                            return {
                                src: srcElement ? srcElement.href : null,
                                chapterTitle: srcElement ? srcElement.innerText : null,
                            };
                        });
                        return content;
                    })
                );

                // download the manga profile image
                console.log("Downloading manga profile image...");
                console.log("manga", manga)
                // downloadManga(manga)
                const mangaId = await createMangaRecord(manga)

                console.log("mangaId", mangaId)

                // go to each chapter page and get the images
                for (const chapter of data) {
                    console.log("Navigating to: ", chapter.src);
                    await page.goto(chapter.src);
                    await delay(1000);

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

                    // download the images
                    console.log("Downloading chapter images...");
                    console.log("chapter", chapter);
                    // downloadChapter(chapter, manga, data)
                    uploadChapter(chapter, mangaId, data)

                    mangaData = {
                        ...manga,
                        chapters: data
                    }

                    // console.log("mangaData", mangaData);
                }
            }


            await page.close();

        } catch (e) {
            console.log("scrape failed", e);
        } finally {
            await browser?.close();
        }



        console.log("Finished scraping page", i, "of", 2553);
    }




}

async function downloadManga(data) {

    // create the mangas folder if it does not exist and create the manga folder if it does not exist
    if (!fs.existsSync("./mangas")) {
        console.log("No mangas folder found. Creating mangas folder...");
        fs.mkdirSync("./mangas");
        if (!fs.existsSync(`./mangas/${data.title}`)) {
            console.log(`No manga folder found for ${data.title}. Creating manga folder...`);
            fs.mkdirSync(`./mangas/${data.title}`);
        }
    }

    try {

        // download the imaage and save it to the chapter folder as the manga profile image
        let fileName = `./mangas/${data.title}/profile.jpg`;

        // check if the file already exists
        if (fs.existsSync(fileName)) {
            // read the existing file and check if it's the same
            const existingFile = fs.readFileSync(fileName);
            const newFile = await fetch(data.img).then((res) => res.buffer());
            if (existingFile.equals(newFile)) {
                console.log(`Skipped ${fileName}`);
            } else {
                // add a number to the file name if it already exists but is not the same
                let i = 1;
                while (fs.existsSync(`./mangas/${data.title}/profile-${i}.jpg`)) {
                    i++;
                }
                fileName = `./mangas/${data.title}/profile-${i}.jpg`;
            }
        }
        // download the file and save it
        const response = await fetch(data.img);
        const buffer = await response.buffer();
        fs.writeFileSync(fileName, buffer);
        console.log(`Downloaded ${fileName}`);

    }
    catch (e) {
        console.log("download failed", e, e.message);
    }
}

async function downloadChapter(chapter, manga, data) {

    // create the mangas folder if it does not exist and create the manga folder if it does not exist and create the chapter folder if it does not exist
    if (!fs.existsSync("./mangas")) {
        console.log("No mangas folder found. Creating mangas folder...");
        fs.mkdirSync("./mangas");
        console.log(`Created mangas folder. Creating manga folder...`);

    }
    if (!fs.existsSync(`./mangas/${manga.title}`)) {
        console.log(`No manga folder found for ${manga.title}. Creating manga folder...`);
        fs.mkdirSync(`./mangas/${manga.title}`);
        console.log(`Created manga folder for ${manga.title}. Creating chapter folder...`);

    }
    if (!fs.existsSync(`./mangas/${manga.title}/${chapter.chapterTitle}`)) {
        console.log(`No chapter folder found for ${chapter.chapterTitle}. Creating chapter folder...`);
        fs.mkdirSync(`./mangas/${manga.title}/${chapter.chapterTitle}`);

    }

    try {
        // loop through the data and download each image and save it to the chapter folder with the page number as the file name
        for (const image of data) {
            let fileName = `./mangas/${manga.title}/${chapter.chapterTitle}/${image.pageNumber}.jpg`;

            // check if the file already exists
            if (fs.existsSync(fileName)) {
                // read the existing file and check if it's the same
                const existingFile = fs.readFileSync(fileName);
                const newFile = await fetch(image.imageUrl).then((res) => res.buffer());
                if (existingFile.equals(newFile)) {
                    console.log(`Skipped ${fileName}`);
                } else {
                    // add a number to the file name if it already exists but is not the same
                    let i = 1;
                    while (fs.existsSync(`./mangas/${manga.title}/${chapter.chapterTitle}/${image.pageNumber}-${i}.jpg`)) {
                        i++;
                    }
                    fileName = `./mangas/${manga.title}/${chapter.chapterTitle}/${image.pageNumber}-${i}.jpg`;
                }
            }
            // download the file and save it
            const response = await fetch(image.imageUrl);
            const buffer = await response.buffer();
            fs.writeFileSync(fileName, buffer);
            console.log(`Downloaded ${fileName}`);
        }

    }
    catch (e) {
        console.log("download failed", e, e.message);
    }
}


async function createMangaRecord(data) {
    const id = await generateId()
    console.log("id", id)
    try {
        // Check if the record already exists
        const checkExistance = await axios.get(`http://localhost:8080/api/collections/manga/records?sort=&filter=title="${data.title}"`);

        // If data exists, return the existing record ID
        if (checkExistance.data.items.length > 0) {
            console.log(`Manga record with title "${data.title}" already exists with ID: ${checkExistance.data.items[0].id}`);
            return checkExistance.data.items[0].id;
        }

        // Convert image data to base64
        const imageResponse = await axios.get(data.img, {
            responseType: 'arraybuffer'
        });
        const base64Image = Buffer.from(imageResponse.data, 'binary').toString('base64');

        const response = await axios.post('http://localhost:8080/api/collections/manga/records', {
            "id": id ? id : "",
            "title": data.title ? data.title : "",
            "img": base64Image ? `data:image/jpeg;base64,${base64Image}` : "",
            "image": data.img ? data.img : "",
            "tags": data.tags ? data.tags : [],
            "latestChapter": data.latestChapter ? data.latestChapter : 0,
            "src": data.src ? data.src : "",
            "description": data.description ? data.description : "",
            "author": data.author ? data.author : "",
        });
        console.log(`Manga record created with ID: ${response.data.id}`);
        return response.data.id;
    } catch (error) {
        console.error(`Error creating manga record: ${error}`);
    }
}

async function uploadChapter(chapter, mangaId, data) {

    try {
        // Check if the record already exists
        const checkExistance = await axios.get(`http://localhost:8080/api/collections/chapters/records?sort=&filter=title="${chapter.chapterTitle}"&&mangaId="${mangaId}"`);

        // If data exists, return the existing record ID
        if (checkExistance.data.items.length > 0) {
            console.log(`Chapter record with title "${chapter.chapterTitle}" and managaId ${mangaId} already exists with ID: ${checkExistance.data.items[0].id}`);
            return checkExistance.data.items[0].id;
        }

        const chapterData = {
            mangaId: mangaId ? mangaId : "",
            src: chapter.src ? chapter.src : "",
            title: chapter.chapterTitle ? chapter.chapterTitle : "",
        };
        const response = await axios.post(`http://localhost:8080/api/collections/chapters/records`, chapterData);
        console.log(`Chapter record created with ID: ${response.data.id}`);



        // loop through the data and upload each image to the chapter record
        for (const image of data) {
            // Convert image data to base64
            const imageDownload = await axios.get(image.imageUrl, {
                responseType: 'arraybuffer'
            });
            const base64Image = Buffer.from(imageDownload.data, 'binary').toString('base64');

            const imageData = {
                pageNumber: image.pageNumber ? image.pageNumber : "",
                img: image.imageUrl ? image.imageUrl : "",
                chapterId: response.data.id ? response.data.id : "",
                totalPages: image.totalPages ? image.totalPages : "",
                chapterText: image.chapterText ? image.chapterText : "",
                image: base64Image ? `data:image/jpeg;base64,${base64Image}` : "",
            };

            // check if the image record already exists
            const existingImage = await axios.get(`http://localhost:8080/api/collections/images/records?sort=&filter=chapterId="${response.data.id}"&&pageNumber="${imageData.pageNumber}"`);
            if (existingImage.data.length > 0) {
                console.log(`Skipped ${imageData.imageUrl}`);
            }
            // create a new image record
            const imageResponse = await axios.post('http://localhost:8080/api/collections/images/records', imageData);
            console.log(`Image record created with ID: ${imageResponse.data.id}`);

        }
    } catch (error) {
        console.error(`Error creating chapter record: ${error}`);
    }
}

run();

