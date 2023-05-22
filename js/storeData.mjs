
import axios from 'axios';
import { create } from 'ipfs-http-client';

const ipfs = create()


const hostURL = process.env.HOST_URL

export async function storeData(scrapedData) {
    // Add IPFS storage logic here
    const ipfsFiles = [];
    const mangaData = [];

    for (const content of scrapedData) {
        const { img, title } = content;

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
        };
        mangaData.push(mangaInfo);

        // Add the image to IPFS MFS with the title as the filename
        const mfsPath = `/images/${title}.png`; // Customize the path and file extension as needed
        await ipfs.files.write(mfsPath, imageBuffer, { create: true, parents: true });
        console.log('Added image to IPFS MFS', mfsPath);
    }

    return { ipfsFiles, mangaData };
}