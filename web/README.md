
# Exa Con Monitor

View at [exa-applet-taylor.vercel.app](https://exa-applet-taylor.vercel.app/)

Succeeding as a self-employed author requires hours of online daily grunt work. Writers need to maintain a social media presence, attend book shows with buyers and readers, and track any news related to their content.

Exa's Search API makes it simple to surface information to writers that can make a difference to their business. In this quick demo, we create a feed of every literary event in the author's state, with an emphasis on comic book conventions.

This information otherwise lives on separate venue websites, word of mouth, and personal blogs. By aggregating it and standardizing it, Exa makes it simple to import into calendar apps, or to cross-reference with other information (for example, supporting a chatbot that can find the least expensive hotel rooms and airfare across many possible events).

This demo uses Exa (via `exa-js`) to build a natural-language query, and calls `searchAndContents` with `useAutoprompt`, requesting highlights + page text. Results are then normalized into `EventItem` objects by extracting dates/locations and retaining the source URL and metadata. Data is cached in Postgres so that subsequent loads do not requery Exa. This minimizes cost and maximizes speed and relevance.

## Why did I choose this demo?

Creators are skeptical of AI. Using Exa to automate an objective, real-world part of creative work is a starting point for deeper integrations into the creative process. It can also be shared with other prospects in related industries. For example, hotel management platforms also have a general need for real-time event data, as do running race coordinators. Patreon, Gumroad, and Shopify also can use this data for authors on their platforms. Event data is the broad category, and writers are the niche I focused on here.

## Final note

I would love to have used Websets for this demo, but I did not upgrade to a Pro account. Also, note that the demo URL for Websets on the Exa website is returning an Application Error:

- [Websets demo](https://demo.exa.ai/websets-news-monitor?_gl=1*srl7tb*_gcl_aw*R0NMLjE3Njk1NTgwMDcuQ2owS0NRaUE0ZUhMQmhDekFSSXNBSjJOWm9JZWNlTHU5Y2VYalhfOUducklEZmNTajY2Rmk5UWVXYVF1ai1LeFQ3dkJCVEoxelVfS2xlVWFBbnFoRUFMd193Y0I.*_gcl_au*MTAwNjEzOTQ0Ny4xNzY5MDMzMjgzLjE4NDI3MTE3MTYuMTc2OTY0NjU4OC4xNzY5NjQ2NTg3*FPAU*MTAwNjEzOTQ0Ny4xNzY5MDMzMjgz*_ga*MTUwMTU5MjEyMS4xNzY5MDMzMjgz*_ga_CPMTFL65Z3*czE3Njk3MTQ0ODkkbzE0JGcxJHQxNzY5NzE0NDkxJGo1OCRsMCRoMTMzMzc0OTIwMQ..*_fplc*VWhQc3d2elMlMkJIQWtBWEtacGFQaGtXcTFwRU5XcmtKMktRNWIlMkZpY2Zmc0JGcjVxRFBiTW1YbTNoZVFhYU9MRHlVY1k2QkhpSnQ3UmN4T2dkb1AlMkJHaGlod25mNCUyRnhJRFNnQUpNTEVXazdHMlFZbTMxd1oyVjIwRkZKQk9VeEElM0QlM0Q.)