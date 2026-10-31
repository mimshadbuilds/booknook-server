import express from 'express';
import { MongoClient } from 'mongodb';
import 'dotenv/config'
import cors from 'cors'


const app = express();
const port = process.env.PORT || 8000;

app.use(cors())
app.use(express.json())

const client = new MongoClient(process.env.MONGODB_URI)

export async function connectToMongoDB() {
    try {
        await client.connect();
        console.log("Successfully connected to MongoDB!");
        return client;
    } catch (err) {
        console.dir(err);
    }
}

connectToMongoDB()


app.get('/', (req, res) => {
    res.send({msg: 'BookNook Server is in service!'})
})

app.listen(port, () => {
    console.log(`BookNook server is runnig at ${port}`)
})