import * as IPFS from 'ipfs-core'

async function main() {
  const node = await IPFS.create()
  const version = await node.version()

  console.log('Version:', version.version)

  const file =await node.add( {
    path: "/tmp/myfile2.txt",
    content: `
        <!DOCTYPE html>
        <html>
            <head>
                <title>IPFS</title>
            </head>
            <body>
                <h1>Hi Node.js 4</h1>
            </body>
        </html>
        `
  });

  console.log('Added file:', file.path, file.cid.toString())

  // add multiple files
  const files = [{
    path: "/tmp/myfile2.txt",
    content: `
        <!DOCTYPE html>
        <html>
            <head>
                <title>IPFS</title>
            </head>
            <body>
                <h1>Hi Node.js</h1>
            </body>
        </html>
    `
  }];

  for await (const result of node.addAll(files)) {
    console.log(result)
  }

  // pin files
  for await (const data of node.pin.ls()) {
    for await (const data1 of node.pin.addAll(data)) {
      console.log("pinned ", data1)
    }
    console.log("ls data", data.cid.toString(), "type", data.type)
  }
  
  await node.name.publish(file.cid.toString(), { resolve: false }).then((res) => {
    console.log("published ", res)
  })

  console.log("published ", file.cid.toString())
}

main()