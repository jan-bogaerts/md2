---
author: 
id: F_454
internalId: 5b8fe025-448b-453b-a4f4-44d680b4a037
title: improve review diagram changes dialog
status: design
owner: 
affects:
agents:
policy:
---

We have the 'review changes dialog' where the user can see all the changes that were applied to a diagram since it was last changed. If there are any, this list can be sent to an agent with a prompt.

When we created a new diagram, a mind map for instance, and then edit it, the 'review changes dialog' shows 'no diagram changes to review' and 'editable diagram is valid'.

Things to do:

* 'editable diagram is valid' this must be removed, it has no value. Only show something if the diagram is not valid, and why it is not valid.
* There is a non editable 'generated text' box. This must be a markdown editor (reuse existing component) so the user can change the text.
* the dialog must be resizable so the user can adjust the size of the input markdown editor.
* for new diagrams that don't have an 'edit' section yet, we need to be able to include the entire diagram in the instructions. perhaps best with a link?
* the 'review diagram changes' should resemble more like the 'new card' dialog, cause that is what the final end result should be of the action.\
  So the 'tooltip should also change to 'add card to implement diagram'
  * user must be able to select card type, column it should added to and add / modify a title
* auto generated title: `implement $diagram-title`&#x20;