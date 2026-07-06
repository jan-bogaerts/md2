we just implemented an app with the initial architectural description found in all the markdown files in the folder `design\architecture\initial description`.
feature descriptions that were implemented can be found at `design\feature_descriptions`.
animations, batch commands, and remarkable integration are not yet done.
For the rest, check that:  everything is fully and correctly implemented.
list all:
- missing stuff
- incorrectly implemented
- bad design, 
- not following architectural design
- code smells

We already know that:
- github authorization is inconsistent: the react app uses oauth, which requires an authorization callback url, which is a problem at the moment since we don't have a backend. Either we need to add a backend for this single purpose or use a different approach.