# manga scraper that can download manga and can save it in a database(pocketbase)
you have to set a simple pocketbase on port 8080. make sure to make three collections named manga, chapters, and images

this is their structure:
```javascript
manga:
{
    "id": "",
    "title":  "",
    "img":  "",
    "image": "",
    "tags":  [],
    "latestChapter":  0,
    "src":  "",
    "description": "",
    "author": "",
}

chapters:
{
    mangaId:  "",
    src:  "",
    title: "",
}

images:
{
    pageNumber: "",
    img: "",
    chapterId:"",
    totalPages: "",
    chapterText:  "",
    image: "",
}
```

# How to use
1. clone the repo
2. run `npm install`
3. run `npm start`

# How to use the api
1. go to `localhost:8080/_/` the api is pocketbases api so you can use it like that 
