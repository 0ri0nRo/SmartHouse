package todolist

import (
	"context"
	"fmt"
	"time"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

type Service struct {
	client *mongo.Client
	dbName string
}

func New(mongoURI string) (*Service, error) {
	if mongoURI == "" {
		return &Service{client: nil, dbName: ""}, nil
	}
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	client, err := mongo.Connect(ctx, options.Client().ApplyURI(mongoURI))
	if err != nil {
		return nil, fmt.Errorf("connect mongo: %w", err)
	}
	return &Service{client: client, dbName: "smarthouse"}, nil
}

func (s *Service) collection() *mongo.Collection {
	if s.client == nil {
		return nil
	}
	return s.client.Database(s.dbName).Collection("todolist")
}

func (s *Service) InsertItem(ctx context.Context, doc map[string]any) (string, error) {
	col := s.collection()
	if col == nil {
		return "", fmt.Errorf("mongo not configured")
	}
	if doc["timestamp"] == nil {
		doc["timestamp"] = time.Now()
	}
	doc["purchased"] = false
	res, err := col.InsertOne(ctx, doc)
	if err != nil {
		return "", err
	}
	id := res.InsertedID.(primitive.ObjectID).Hex()
	return id, nil
}

func (s *Service) ReadCurrentItems(ctx context.Context) ([]map[string]any, error) {
	col := s.collection()
	if col == nil {
		return []map[string]any{}, nil
	}
	cur, err := col.Find(ctx, bson.M{"purchased": false}, options.Find().SetSort(bson.D{{"timestamp", -1}}))
	if err != nil {
		return nil, err
	}
	defer cur.Close(ctx)
	var out []map[string]any
	for cur.Next(ctx) {
		var m bson.M
		if err := cur.Decode(&m); err != nil {
			return nil, err
		}
		if id, ok := m["_id"].(primitive.ObjectID); ok {
			m["id"] = id.Hex()
			delete(m, "_id")
		}
		out = append(out, m)
	}
	return out, nil
}

func (s *Service) DeleteItem(ctx context.Context, idHex string) (bool, error) {
	col := s.collection()
	if col == nil {
		return false, fmt.Errorf("mongo not configured")
	}
	id, err := primitive.ObjectIDFromHex(idHex)
	if err != nil {
		return false, err
	}
	res, err := col.DeleteOne(ctx, bson.M{"_id": id})
	if err != nil {
		return false, err
	}
	return res.DeletedCount > 0, nil
}

func (s *Service) MarkAsPurchased(ctx context.Context, idHex string, info map[string]any) (bool, error) {
	col := s.collection()
	if col == nil {
		return false, fmt.Errorf("mongo not configured")
	}
	id, err := primitive.ObjectIDFromHex(idHex)
	if err != nil {
		return false, err
	}
	update := bson.M{"$set": bson.M{"purchased": true, "purchased_at": time.Now(), "purchase_info": info}}
	res, err := col.UpdateOne(ctx, bson.M{"_id": id}, update)
	if err != nil {
		return false, err
	}
	return res.ModifiedCount > 0, nil
}

func (s *Service) MarkAsUnpurchased(ctx context.Context, idHex string) (bool, error) {
	col := s.collection()
	if col == nil {
		return false, fmt.Errorf("mongo not configured")
	}
	id, err := primitive.ObjectIDFromHex(idHex)
	if err != nil {
		return false, err
	}
	update := bson.M{"$set": bson.M{"purchased": false}, "$unset": bson.M{"purchased_at": "", "purchase_info": ""}}
	res, err := col.UpdateOne(ctx, bson.M{"_id": id}, update)
	if err != nil {
		return false, err
	}
	return res.ModifiedCount > 0, nil
}

func (s *Service) ClearPurchased(ctx context.Context) (int64, error) {
	col := s.collection()
	if col == nil {
		return 0, fmt.Errorf("mongo not configured")
	}
	res, err := col.DeleteMany(ctx, bson.M{"purchased": true})
	if err != nil {
		return 0, err
	}
	return res.DeletedCount, nil
}

func (s *Service) BulkMarkPurchased(ctx context.Context, ids []string) (int64, error) {
	col := s.collection()
	if col == nil {
		return 0, fmt.Errorf("mongo not configured")
	}
	var objIDs []primitive.ObjectID
	for _, h := range ids {
		id, err := primitive.ObjectIDFromHex(h)
		if err == nil {
			objIDs = append(objIDs, id)
		}
	}
	if len(objIDs) == 0 {
		return 0, nil
	}
	res, err := col.UpdateMany(ctx, bson.M{"_id": bson.M{"$in": objIDs}}, bson.M{"$set": bson.M{"purchased": true, "purchased_at": time.Now()}})
	if err != nil {
		return 0, err
	}
	return res.ModifiedCount, nil
}

func (s *Service) GetByID(ctx context.Context, idHex string) (map[string]any, error) {
	col := s.collection()
	if col == nil {
		return nil, fmt.Errorf("mongo not configured")
	}
	id, err := primitive.ObjectIDFromHex(idHex)
	if err != nil {
		return nil, err
	}
	var m bson.M
	if err := col.FindOne(ctx, bson.M{"_id": id}).Decode(&m); err != nil {
		if err == mongo.ErrNoDocuments {
			return nil, nil
		}
		return nil, err
	}
	if idv, ok := m["_id"].(primitive.ObjectID); ok {
		m["id"] = idv.Hex()
		delete(m, "_id")
	}
	return m, nil
}

func (s *Service) FindPurchasedRange(ctx context.Context, start, end *time.Time) ([]map[string]any, error) {
	col := s.collection()
	if col == nil {
		return []map[string]any{}, nil
	}
	filter := bson.M{"purchased": true}
	if start != nil || end != nil {
		rng := bson.M{}
		if start != nil {
			rng["$gte"] = *start
		}
		if end != nil {
			rng["$lte"] = *end
		}
		filter["purchased_at"] = rng
	}
	cur, err := col.Find(ctx, filter, options.Find().SetSort(bson.D{{"purchased_at", -1}}))
	if err != nil {
		return nil, err
	}
	defer cur.Close(ctx)
	var out []map[string]any
	for cur.Next(ctx) {
		var m bson.M
		if err := cur.Decode(&m); err != nil {
			return nil, err
		}
		if id, ok := m["_id"].(primitive.ObjectID); ok {
			m["id"] = id.Hex()
			delete(m, "_id")
		}
		out = append(out, m)
	}
	return out, nil
}
