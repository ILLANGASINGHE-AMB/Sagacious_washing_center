### In Transport Tab,

This tab should link with Drivers Tab data and Vehicles Tab Data and fetch required data from those pages and tables

### The Overview of the transport tab

|Trip ID|	|Driver|	|Start Date/Time|	|Customer Visit Sequence|	|Distance (KM)|	|Status|	|Actions|

#### Issues and Fixes

-Remove fuel Price option completely
-Driver profiles and Transport page should be linked
-Should be able to handle multiple vehicles, but one vehicle can have only one trip at once, cannot start two trips for one vehicle at once,
-for the transport tab , when selected a driver profile and started a trip for that driver profile, the driver should not be available for new trips until the ongoing trip is completed,
-The Km Range enter for a specific vehicle at the end of a trip should the start of next trip for the same vehicle, for other vehicles, this should be caliberated separately,
-if click |view| button in trip table per trip, it should show the distance travelled (end km - start km)
-the end trip dialog box should not pop up automatically when start and save a new trip
-Km range should not be changed when it is auto caliberated as the start km when it was taken from last trip end km,
-end distance must be greater than start km distance
-two buttons to separate on going trips and completed trips
-the trips should be orderd based on the start date
-start and end date and time should be filled automatically and can be edited if needed (use 12 hour clock)



### New Trip Form ###

click on |new trip| button

Trip ID - autofilled
Driver - (link with driver profiles added) - drop down selection
Vehicle - (linked with vehicle profiles added) - drop down selection
Start Date - auto filled ( editable)
Start Time - auto filled (editable)
Start km - auto filled from (previous and cannot be changed)

 |start and save|



### End Trip Form ###

click on |end trip| button in each trip row,

End Km - (should be greter than start km)
End Date - auto filled ( editable)
End Time - auto filled (editable)
select visited customers in order
Additional Notes(optional)

|End Trip|
