import express from 'express';
import { MongoClient, ObjectId } from 'mongodb';
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
        addedByName: req.body.addedByName,
        addedByEmail: req.body.addedByEmail,
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

//http://localhost:8000/books/:id
app.get("/books/:id", async (req, res) => {
    const { id } = req.params;

    if (!ObjectId.isValid(id)) {
        return res.status(400).json({
        message: "Invalid book ID."
    });
}
    try {
        const result = await booksCollection.findOne({ _id: new ObjectId(id) });
        if (!result) {
            return res.status(404).json({ message: "Book not found." });
        }
        res.send(result);
    } catch (err) {
        console.error("Error fetching details endpoint:", err);
        res.status(500).json({
            message: "Failed to fetch book."
        });
    }
});

//http://localhost:8000/my-books
app.get("/my-books/:email", async (req, res) => {
    const { email } = req.params;

    if (!email) {
        return res.status(400).json({
            message: "User email is required.",
        });
    }

    try {
        const result = await booksCollection
            .find({ addedByEmail: email })
            .sort({ createdAt: -1 })
            .toArray();

        res.send(result);
    } catch (err) {
        console.error("Error fetching user's books:", err);

        res.status(500).json({
            message: "Failed to fetch your books.",
        });
    }
});


//http://localhost:8000/books/:id
app.patch('/books/:id', async (req, res) => {
    const { id } = req.params;
    const updateData = req.body;

    if (!ObjectId.isValid(id)) {
        return res.status(400).json({
            message: "Invalid book ID."
        });
    }

    try {
        const result = await booksCollection.updateOne(
            { _id: new ObjectId(id) },
            { $set: updateData }
        );
        if (result.matchedCount === 0) {
            return res.status(404).json({ message: "Book not found." });
        }
        res.send({ message: "Book updated successfully." });
    } catch (err) {
        console.error("Error updating book", err);
        res.status(500).json({
            message: "Failed to update book."
        });
    }
});

app.delete('/books/:id', async (req, res) => {
    const { id } = req.params;

    if (!ObjectId.isValid(id)) {
        return res.status(400).json({
            message: "Invalid book ID."
        });
    }

    try {
        const result = await booksCollection.deleteOne({ _id: new ObjectId(id) });
        if (result.deletedCount === 0) {
            return res.status(404).json({ message: "Book not found." });
        }
        res.send({ message: "Book deleted successfully." });
    } catch (err) {
        console.error("Error deleting book", err);
        res.status(500).json({
            message: "Failed to delete book."
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
            { $sort: { borrows: -1 }},
            { $limit: 4 },
            { $lookup: {
                    from: "books",
                    localField: "_id",
                    foreignField: "_id",
                    as: "book"
                }
            },
            { $unwind: "$book"},
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

//http://localhost:8000/borrows
app.post("/borrows", async (req, res) => {
    const { bookId, userId } = req.body;

    if (!ObjectId.isValid(bookId) || !userId) {
        return res.status(400).send({
            message: "Invalid book or user information."
        });
    }

    const session = mongoClient.startSession();

    let response;

    try {
        await session.withTransaction(async () => {
            const bookObjectId = new ObjectId(bookId);

            const book = await booksCollection.findOne(
                { _id: bookObjectId },
                { session }
            );

            if (!book) {
                response = {
                    status: 404,
                    message: "Book not found."
                };
                return;
            }

            const alreadyBorrowed = await borrowedCollection.findOne(
                {
                    bookId: bookObjectId,
                    userId,
                    status: "borrowed"
                },
                { session }
            );

            if (alreadyBorrowed) {
                response = {
                    status: 409,
                    message: "You have already borrowed this book."
                };
                return;
            }

            if (book.copies <= 0) {
                response = {
                    status: 400,
                    message: "This book is currently unavailable."
                };
                return;
            }

            const updateCopies = await booksCollection.updateOne(
                {
                    _id: bookObjectId,
                    copies: { $gt: 0 }
                },
                {
                    $inc: { copies: -1 }
                },
                { session }
            );

            if (updateCopies.modifiedCount === 0) {
                response = {
                    status: 400,
                    message: "This book is currently unavailable."
                };
                return;
            }

            const borrowing = {
                bookId: bookObjectId,
                userId,
                borrowedAt: new Date(),
                returnedAt: null,
                status: "borrowed"
            };

        await borrowedCollection.insertOne(borrowing, { session });
            response = {
                status: 201,
                message: "Book borrowed successfully."
            };
        });
    } finally {
        await session.endSession();
    }

    res.status(response.status).send({
        message: response.message
    });
});

//get the borrows of logged in user
//http://localhost:8000/borrows?userId=123
app.get("/borrows", async (req, res) => {
    const { userId } = req.query;

    if (!userId) {
        return res.status(400).send({
            message: "User ID is required."
        });
    }

    try {
        const result = await borrowedCollection.aggregate([
            {
                $match: { userId }
            },
            {
                $sort: { borrowedAt: -1 }
            },
            {   // Join with the books collection to get book details
                $lookup: {
                    from: booksCollection.collectionName,
                    localField: "bookId",
                    foreignField: "_id",
                    pipeline: [
                        {
                            $project: {
                                title: 1,
                                author: 1,
                                category: 1,
                                bookImage: 1
                            }
                        }
                    ],
                    as: "book"
                }
            },
            {
                $unwind: {
                    path: "$book",
                    // preserveNullAndEmptyArrays: true
                }
            }
        ]).toArray();

        return res.send(result);
    } catch (error) {
        console.error("Get borrows error:", error);

        return res.status(500).send({
            message: "Unable to retrieve borrowing records."
        });
    }
});

//http://localhost:8000/borrows/:id
app.patch("/borrows/:id", async (req, res) => {
    const { id } = req.params;

    if (!ObjectId.isValid(id)) {
        return res.status(400).send({
            message: "Invalid borrowing ID."
        });
    }

    const session = mongoClient.startSession();

    try {
        const result = await session.withTransaction(async () => {
            const borrowing = await borrowedCollection.findOne(
                {
                    _id: new ObjectId(id),
                    status: "borrowed"
                },
                { session }
            );

            if (!borrowing) {
                return {
                    status: 404,
                    message: "Active borrowing record not found."
                };
            }

            await borrowedCollection.updateOne(
                {
                    _id: borrowing._id,
                    status: "borrowed"
                },
                {
                    $set: {
                        status: "returned",
                        returnedAt: new Date()
                    }
                },
                { session }
            );

            await booksCollection.updateOne(
                { _id: borrowing.bookId },
                { $inc: { copies: 1 } },
                { session }
            );

            return {
                status: 200,
                message: "Book returned successfully."
            };
        });

        return res.status(result.status).send({
            message: result.message
        });
    } catch (error) {
        console.error("Return book error:", error);

        return res.status(500).send({
            message: "Unable to return this book. Please try again."
        });
    } finally {
        await session.endSession();
    }
});

//http://localhost:8000/
app.get('/', (req, res) => {
    res.send({msg: 'BookNook Server is in service!'})
})

app.listen(port, () => {
    console.log(`BookNook server is runnig at ${port}`)
})