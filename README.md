# MMM-ChartProvider-Words
A magic mirror module that counts words in feeds sends to Chartdisplay

Like all chart providers, this one will create a standard output feed in NDTF containing information about the counts of words by word from its input.

input can be a url, where the html returned will be processed, a local file, ditto processing or output from a feed provider.

if the input is the output from a feed provider, the config for this module will include an id, and the feedprovider's config will  contain a matching consumerid to this modules id.

TODO During word counting, all HTML tags can be removed

the output will be {subject:"the word",object;"countofoword",value:the actual countof words;timestamp:probably use the runtime but this could be a historical date allowing for analysis of word counts over time.}

only one input is allowed per chartprovider, and there will only be one feed used

the code is based on chartprovider-json, with additional code taken from feeddisplay to handle an incoming RSS2.0 feed, this way the words can be provided from one or more feedproviders (i.e. twitter and instagram)

