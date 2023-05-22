
import axios from 'axios';
import { create } from 'ipfs-http-client';

const ipfs = create()


const hostURL = process.env.HOST_URL
const baseURL = "https://mangapark.net/";

export async function storeData(scrapedData) {
    // Add IPFS storage logic here
    const ipfsFiles = [];
    const mangaData = [];

    for (const content of scrapedData) {
        const {
            img,
            title,
            tags,
            latestChapter,
            src,
            description,
            author,
        } = content;

        console.log('Fetching image', img);

        // Fetch the image data
        const imageResponse = await axios.get(img, {
            responseType: 'arraybuffer',
        });

        // Add the image data to IPFS
        const imageBuffer = Buffer.from(imageResponse.data);
        const ipfsFile = await ipfs.add(imageBuffer);

        // Pin the added image
        const pinned = await ipfs.pin.add(ipfsFile.cid);
        const pinList = await ipfs.pin.ls();

        let isPinned = false
        console.log('Pinned objects:');
        for await (const pin of pinList) {
            if (pin.cid.toString() === ipfsFile.cid.toString()) {
                isPinned = true
            }
        }

        ipfsFiles.push(ipfsFile);

        // Store manga data with IPFS information
        const mangaInfo = {
            title,
            cid: ipfsFile.cid.toString(), // Store the CID as a string
            size: ipfsFile.size,
            img: `${hostURL}/ipfs/${ipfsFile.cid.toString()}`,
            isPinned,
            tags,
            latestChapter,
            src,
            description,
            author,

        };
        mangaData.push("mangaInfo", mangaInfo);
        console.log('Manga data', mangaInfo);

        // Add the image to IPFS MFS with the title as the filename
        const mfsPath = `/images/${title}.png`; // Customize the path and file extension as needed
        await ipfs.files.write(mfsPath, imageBuffer, { create: true, parents: true });
        console.log('Added image to IPFS MFS', mfsPath);

        // store manga data to database
        const mangaId = await createMangaRecord(mangaInfo);

    }

    return { ipfsFiles, mangaData };
}


async function createMangaRecord(data) {
    const id = await generateId()
    console.log("id", id)
    try {
        // Check if the record already exists
        const checkExistance = await axios.get(`http://localhost:8080/api/collections/manga/records?sort=&filter=title="${data.title}"`);

        // If data exists, return the existing record ID
        if (checkExistance.data.items.length > 0 && data.cid === checkExistance.data.items[0].imageCid) {
            console.log(`Manga record with title "${data.title}" already exists with ID: ${checkExistance.data.items[0].id} and name: ${checkExistance.data.items[0].title}`);
            return checkExistance.data.items[0].id;
        }

        const response = await axios.post('http://localhost:8080/api/collections/manga/records', {
            "id": id ? id : "",
            "title": data.title ? data.title : "",
            "img": data.img ? data.img : "",
            "tags": data.tags ? data.tags : [],
            "latestChapter": data.latestChapter ? data.latestChapter : 0,
            "src": data.src ?  `${baseURL}${data.src}` : "",
            "description": data.description ? data.description : "",
            "author": data.author ? data.author : "",
            "imageCid": data.cid ? data.cid : "",
            "isPinned": data.isPinned ? data.isPinned : false,
        });

        console.log(`Manga record created with ID: ${response.data.id}`);
        return response.data.id;
    } catch (error) {
        console.error(`Error creating manga record: ${error}`);
    }
}

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
