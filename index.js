import { ApolloServer } from "@apollo/server";
import { startStandaloneServer } from '@apollo/server/standalone';
import { typeDefs } from "./schema.js";

//import db for data
import db from "./_db.js"

//resolvers

const resolvers={
    Query :{
        games() {
            return db.games
        },
        reviews(){
            return db.reviews
        },
        authors(){
            return db.authors
        },       
        review(_,arg){
            return db.reviews.find((review)=>review.id===arg.id)
        },
        game(_,arg){
            return db.games.find((game)=>game.id===arg.id)
        },
         author(_,arg){
            return db.authors.find((author)=>author.id===arg.id)
         }
        
    }
}


//server setup
const server=new ApolloServer({
    //typeDefs --it says the defintion of types of data
    typeDefs,
    //resolvers 
    resolvers
})

const {url}=await startStandaloneServer(server,{
    listen:{port:4000}
})
console.log("server start to listen at port",4000)