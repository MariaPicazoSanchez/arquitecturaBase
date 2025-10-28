const passport=require("passport");
const GoogleStrategy = require('passport-google-oauth20').Strategy;
passport.serializeUser(function(user, done) {
    done(null, user);
});
passport.deserializeUser(function(user, done) {
    done(null, user);
});

passport.use(new GoogleStrategy({
    clientID:"1066426825741-14bm07md25p7l7b8bnbmile9oeqrivl5.apps.googleusercontent.com",
    clientSecret: "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",
    callbackURL: "http://localhost:3000/google/callback"
    },
    function(accessToken, refreshToken, profile, done) {
        return done(null, profile);
    }
));