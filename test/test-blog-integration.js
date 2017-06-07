'use strict';

const chai = require('chai');
const chaiHttp = require('chai-http');
const chaiDateString = require('chai-date-string');
const faker = require('faker');
const mongoose = require('mongoose');

// this makes the should syntax available throughout
// this module
const should = chai.should();

const {BlogPost} = require('../models');
const {app, runServer, closeServer} = require('../server');
const {TEST_DATABASE_URL} = require('../config');

chai.use(chaiHttp);
chai.use(chaiDateString);

// used to put randomish documents in db
// so we have data to work with and assert about.
// we use the Faker library to automatically
// generate placeholder values for author, title, content
// and then we insert that data into mongo
function seedBlogPostData() {
  console.info('seeding post data');
  const seedData = [];

  for (let i=1; i<=10; i++) {
    seedData.push(generateBlogPostData());
  }
  // this will return a promise
  return BlogPost.insertMany(seedData);
}


function generateBlogPostData() {
  return {
    title: faker.company.bsBuzz(),
    content: faker.lorem.lines(3),
    author: {
      firstName: faker.name.firstName(),
      lastName: faker.name.lastName(),
    }
  };
}


// this function deletes the entire database.
// we'll call it in an `afterEach` block below
// to ensure  data from one test does not stick
// around for next one
function tearDownDb() {
  console.warn('Deleting database');
  return mongoose.connection.dropDatabase();
}


describe('Blog Posts API resource', function() {

  // we need each of these hook functions to return a promise
  // otherwise we'd need to call a `done` callback. `runServer`,
  // `seedBlogPostData` and `tearDownDb` each return a promise,
  // so we return the value returned by these function calls.
  before(function() {
    return runServer(TEST_DATABASE_URL);
  });

  beforeEach(function() {
    return seedBlogPostData();
  });

  afterEach(function() {
    return tearDownDb();
  });

  after(function() {
    return closeServer();
  });

  describe('GET endpoint', function() {

    it('should return all existing blog posts', function() {
      // strategy:
      //    1. get back all blog posts returned by by GET request to `/posts`
      //    2. prove res has right status, data type
      //    3. prove the number of blog posts we got back is equal to number
      //       in db.
      //
      // need to have access to mutate and access `res` across
      // `.then()` calls below, so declare it here so can modify in place
      let res;
      return chai.request(app)
        .get('/posts')
        .then(function(_res) {
          // so subsequent .then blocks can access resp obj.
          res = _res;
          res.should.have.status(200);
          // otherwise our db seeding didn't work
          res.body.posts.should.have.length.of.at.least(1);
          return BlogPost.count();
        })
        .then(function(count) {
          //console.log(count);
          res.body.posts.should.have.lengthOf(count);
        });
    });


    it('should return blog posts with right fields', function() {
      // Strategy: Get back all posts, and ensure they have expected keys

      let resPost;
      return chai.request(app)
        .get('/posts')
        .then(function(res) {
          res.should.have.status(200);
          res.should.be.json;
          res.body.posts.should.be.a('array');
          res.body.posts.should.have.length.of.at.least(1);

          res.body.posts.forEach(function(post) {
            post.should.be.a('object');
            post.should.include.keys(
              'id', 'title', 'content', 'author', 'created');
          });
          resPost = res.body.posts[0];
          return BlogPost.findById(resPost.id);
        })
        .then(function(post) {

          resPost.id.should.equal(post.id);
          resPost.title.should.equal(post.title);
          resPost.content.should.equal(post.content);

          //because time comparisons are the worst and make no sense
          resPost.created.should.be.a.dateString();
          post.created.should.be.a.dateString();
          
        //   console.log(resPost.created);
        //   //console.log(new Date(resPost.created));
        //   console.log(post.created);
        //   const time = post.created;
        //   console.log(time);
        //   //console.log((post.created).toString());
        //   resPost.created.should.equal(time);
        //   post.created.should.satisfy(function(date) {
        //     return date === new Date(resPost.created);
        //   }); //be.a('Date');
          resPost.author.should.contain(post.author.lastName);

        });
    });

    it('should update the correct record on PUT', function(){
      // Some dummy data to "put"
      const dataToPut = {
        author: {
          firstName: 'lil Dude',
          lastName: 'McGee'
        },
        title: 'An interesting thought',
        content: 'What if our dogs only return the ball bc they think we enjoy throwing it?'
      };

      //Then we're going to steal an ID from one of the posts already in the DB
      return BlogPost
        .findOne()
        .exec()
        .then(res=>{
          //Set our dummy ID to match something already in the DB
          dataToPut.id = res.id;

          //Here's where we actually do the PUT - using the ID we just comandeered
          return chai.request(app)
            .put(`/posts/${dataToPut.id}`)
            .send(dataToPut);
        })
        // Now we check for expected results in our returned object.
        .then(res=>{
          res.should.have.status(201);
          res.body.author.should.equal('lil Dude McGee');
          res.body.title.should.equal(dataToPut.title);
          res.body.content.should.equal(dataToPut.content);

          // To take it a step further, let's do a get with the ID we are using,
          // and test that it's correct - verifying that our data is IN the database and persisting
          return chai.request(app)
            .get(`/posts/${dataToPut.id}`)
            .then(res=>{
              res.should.have.status(200);
              res.body.author.should.equal('lil Dude McGee');
              res.body.title.should.equal(dataToPut.title);
              res.body.content.should.equal(dataToPut.content);
            });
        });

    });

    it('should delete a post correctly', function(){
      // variable to store our 'findOne'
      let post;

      BlogPost
        .findOne()
        .exec()
        .then(res=>{
          post = res.body;
          return chai.request(app)
            .delete(`/posts/${post.id}`);
        })
        .then(res=>{
          res.should.have.status(204);
          return BlogPost.findById(post.id).exec();
        })
        .then(thatPost=>{
          should.not.exist(thatPost);
        });

    });

  });

});