# manga scraper that can download manga and can save it in a database(pocketbase)
you have to set a simple pocketbase on port 8080. make sure to make three collections named manga, chapters, and images

this is their structure:
```javascript
manga:
{
    "id": "string",
    "title":  "string",
    "img":  "url",
    "image": "string",
    "tags": " string",
    "latestChapter":  "number",
    "src":  "url",
    "description": "string",
    "author": "string",
}

chapters:
{
    mangaId:  "string",
    src:  "url",
    title: "string",
}

images:
{
    pageNumber: "number",
    img: "url",
    chapterId:"string",
    totalPages: "number",
    chapterText:  "string",
    image: "string",
}
```

# How to use
1. clone the repo
2. run `npm install`
3. run `npm start`

# How to use the api
1. go to `localhost:8080/_/` the api is pocketbases api so you can use it like that 
