import { ApolloServer } from "@apollo/server";
import { startStandaloneServer } from '@apollo/server/standalone';
import { typeDefs } from "./schema.js";

//import db for data
import db from "./_db.js"

//resolvers #this contain the code for the resolver funtion

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
        //return  a  specific reivew on the base of an id      
        review(_,arg){
            return db.reviews.find((review)=>review.id===arg.id)
        },
        game(_,arg){
            return db.games.find((game)=>game.id===arg.id)
        },
         author(_,arg){
            return db.authors.find((author)=>author.id===arg.id)
         }
        
    },
    Game:{
        reviews(parent){
            return db.reviews.filter((data)=>data.game_id===parent.id)
        }
    },
    Author:{
        reviews(parent){
            return db.reviews.filter((data)=>data.author_id===parent.id)
        }
    },
    //this is used for  mutiple querying 
    Review:{ //mutiple querying
        game(parent){
            return db.games.find((data)=>data.id===parent.game_id)
        },
        author(parent){
            return db.authors.find((data)=>data.id===parent.author_id)
        }
    },
    //this is for perfoming the mutaion thing like crud operation functionalities
    Mutation:{
        deleteGame(_,arg){
            db.games=db.games.filter((data)=>data.id!=arg.id)
            return db.games
        },
        addGame(_,arg){
            let game={
                ...arg.game,
                id:Math.floor(Math.random()* 1000).toString()
            }
            db.games.push(game)
            return game
        },
        addAuthor(_,arg){
            let author={
                ...arg.author,
            id:Math.floor(Math.random()*100).toString()

            }
            db.authors.push(author)
            return author
        },
        updateGame(_,arg){
         db.games= db.games.map((g)=>{
                if(g.id===arg.id){
                    return {...g,...arg.edits}
                }
                return g
            } 
        )
        let data=db.games.find((g)=>g.id===arg.id)
        return data
        }
    }
}


//server setup
const server=new ApolloServer({
    //typeDefs --it says the defintion of types of data
    typeDefs,
    //resolvers -here we write the logic for this 
    resolvers
})

const {url}=await startStandaloneServer(server,{
    listen:{port:4000}
})
console.log("server start to listen at port",4000)
