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

const mongoClient = await connectToMongoDB()
const db = mongoClient.db("booknookDB")

const booksCollection = db.collection('books')
const borrowedCollection = db.collection('borrowings')

await borrowedCollection.createIndex(
    { bookId: 1, userId: 1 },
    {
        unique: true,
        partialFilterExpression: {
            status: "borrowed"
        }
    }
);

//http://localhost:8000/add-book
app.post('/add-book', async(req, res) => {
    const data = {
    ...req.body,
    createdAt: new Date()
    }
    const result = await booksCollection.insertOne(data)
    res.send(result);
})

//http://localhost:8000/books
app.get("/books", async (req, res) => {
    try {
        const result = await booksCollection.find().toArray();
        res.send(result);
    } catch (err) {
        console.error("Error fetching books:", err);
        res.status(500).json({
            message: "Failed to fetch books.",
        });
    }
});

//http://localhost:8000/books/most-read
app.get("/books/most-read", async (req, res) => {
    try {
        const result = await borrowedCollection.aggregate([
            {
                $group: {
                    _id: "$bookId",
                    borrows: { $sum: 1 }
                }
            },
            {
                $sort: { borrows: -1 }
            },
            {
                $limit: 4
            },
            {
                $lookup: {
                    from: "books",
                    localField: "_id",
                    foreignField: "_id",
                    as: "book"
                }
            },
            {
                $unwind: "$book"
            },
            {
                $project: {
                    _id: "$book._id",
                    title: "$book.title",
                    author: "$book.author",
                    category: "$book.category",
                    bookImage: "$book.bookImage",
                    copies: "$book.copies",
                    borrows: 1
                }
            }
        ]).toArray();

        res.send(result);
    } catch (err) {
        console.error("Error fetching most-read endpoint:", err);
        res.status(500).json({
            message: "Failed to fetch most-read books."
        });
    }
});






//http://localhost:8000/
app.get('/', (req, res) => {
    res.send({msg: 'BookNook Server is in service!'})
})

app.listen(port, () => {
    console.log(`BookNook server is runnig at ${port}`)
})